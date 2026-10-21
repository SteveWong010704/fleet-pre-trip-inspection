import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sql from 'mssql';

type LegacyRole = { id: string; name: string; description?: string; isSystem?: boolean; permissions?: string[] };
type LegacyUser = { username: string; name: string; password?: string; role: string; assignedDepot?: string; active?: boolean; createdAt?: string };

function passwordHash(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function main() {
  const config: sql.config = {
    server: process.env.MSSQL_SERVER || '192.168.1.215',
    port: Number(process.env.MSSQL_PORT || 1433),
    user: process.env.MSSQL_USER || 'sa',
    password: process.env.MSSQL_PASSWORD || '',
    database: process.env.MSSQL_DATABASE || 'FleetInspectionDB',
    options: { encrypt: process.env.MSSQL_ENCRYPT === 'true', trustServerCertificate: true, enableArithAbort: true },
    connectionTimeout: 10000,
    requestTimeout: 30000,
  };
  if (!config.password) throw new Error('MSSQL_PASSWORD is not set in .env. No connection attempted.');
  const legacyPath = path.resolve(process.env.RBAC_JSON_PATH || path.join(process.cwd(), 'data', 'rbac_store.json'));
  if (!fs.existsSync(legacyPath)) throw new Error(`Legacy RBAC file not found: ${legacyPath}. Export/backup it first; no data changed.`);
  const raw = JSON.parse(fs.readFileSync(legacyPath, 'utf8')) as { users?: LegacyUser[]; roles?: LegacyRole[] };
  const users = Array.isArray(raw.users) ? raw.users : [];
  const roles = Array.isArray(raw.roles) ? raw.roles : [];
  if (!users.length || !roles.length) throw new Error('RBAC JSON has no users or roles. No data changed.');

  const pool = await new sql.ConnectionPool(config).connect();
  try {
    // Fail closed if schema has not been installed. This runner never creates or alters business tables.
    const check = await pool.request().query(`
      SELECT
        OBJECT_ID('dbo.RbacRoles','U') AS rolesTable,
        OBJECT_ID('dbo.RbacUsers','U') AS usersTable,
        OBJECT_ID('dbo.RbacPermissions','U') AS permissionsTable,
        OBJECT_ID('dbo.RbacRolePermissions','U') AS rolePermissionsTable
    `);
    const schema = check.recordset[0];
    if (!schema.rolesTable || !schema.usersTable || !schema.permissionsTable || !schema.rolePermissionsTable) {
      throw new Error('RBAC tables missing. Run scripts/migrate_rbac_schema.sql in the database selected by .env first.');
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const allPermissions = new Set<string>();
      for (const role of roles) for (const permission of role.permissions || []) allPermissions.add(permission);
      // Seed any permission IDs present in the legacy matrix, without overwriting labels already installed.
      for (const permission of allPermissions) {
        await new sql.Request(tx)
          .input('id', sql.NVarChar(100), permission)
          .input('name', sql.NVarChar(150), permission)
          .query(`IF NOT EXISTS (SELECT 1 FROM dbo.RbacPermissions WHERE PermissionId=@id)
                    INSERT dbo.RbacPermissions(PermissionId,PermissionName) VALUES(@id,@name)`);
      }

      for (const role of roles) {
        const roleId = role.id || role.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        await new sql.Request(tx)
          .input('id', sql.NVarChar(100), roleId)
          .input('name', sql.NVarChar(120), role.name)
          .input('description', sql.NVarChar(500), role.description || '')
          .input('system', sql.Bit, Boolean(role.isSystem || role.name.toLowerCase() === 'global admin'))
          .query(`IF NOT EXISTS (SELECT 1 FROM dbo.RbacRoles WHERE RoleId=@id OR RoleName=@name)
                    INSERT dbo.RbacRoles(RoleId,RoleName,[Description],IsSystem) VALUES(@id,@name,@description,@system)`);
        const actual = await new sql.Request(tx).input('name', sql.NVarChar(120), role.name)
          .query(`SELECT TOP 1 RoleId FROM dbo.RbacRoles WHERE RoleName=@name`);
        const actualId = actual.recordset[0]?.RoleId;
        if (!actualId) throw new Error(`Could not resolve SQL role for ${role.name}`);
        for (const permission of role.permissions || []) {
          await new sql.Request(tx).input('roleId', sql.NVarChar(100), actualId)
            .input('permissionId', sql.NVarChar(100), permission)
            .query(`IF NOT EXISTS (SELECT 1 FROM dbo.RbacRolePermissions WHERE RoleId=@roleId AND PermissionId=@permissionId)
                      INSERT dbo.RbacRolePermissions(RoleId,PermissionId) VALUES(@roleId,@permissionId)`);
        }
      }

      for (const user of users) {
        const username = (user.username || '').trim().toLowerCase();
        if (!username || !user.password) {
          console.warn(`[RBAC migration] Skipping ${username || '(blank username)'}: missing username/password.`);
          continue;
        }
        const role = await new sql.Request(tx).input('name', sql.NVarChar(120), user.role)
          .query(`SELECT TOP 1 RoleId FROM dbo.RbacRoles WHERE RoleName=@name`);
        const roleId = role.recordset[0]?.RoleId;
        if (!roleId) throw new Error(`User ${username} references unknown role ${user.role}`);
        const hash = passwordHash(user.password);
        await new sql.Request(tx)
          .input('username', sql.NVarChar(100), username)
          .input('name', sql.NVarChar(150), user.name || username)
          .input('hash', sql.NVarChar(255), hash)
          .input('roleId', sql.NVarChar(100), roleId)
          .input('depot', sql.NVarChar(50), user.assignedDepot || 'ALL')
          .input('active', sql.Bit, user.active !== false)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.RbacUsers WHERE Username=@username)
              INSERT dbo.RbacUsers(Username,DisplayName,PasswordHash,RoleId,AssignedDepot,IsActive,MustChangePassword)
              VALUES(@username,@name,@hash,@roleId,@depot,@active,1)
          `);
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    const counts = await pool.request().query(`
      SELECT (SELECT COUNT(*) FROM dbo.RbacUsers) AS Users,
             (SELECT COUNT(*) FROM dbo.RbacRoles) AS Roles,
             (SELECT COUNT(*) FROM dbo.RbacPermissions) AS Permissions
    `);
    console.log(`[RBAC migration] Completed against ${config.server}/${config.database}. Counts:`, counts.recordset[0]);
    console.log('Legacy JSON was not deleted or modified. This is a one-time import only; switch runtime reads/writes to SQL before considering migration complete.');
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error('[RBAC migration] FAILED:', error.message || error);
  process.exitCode = 1;
});
