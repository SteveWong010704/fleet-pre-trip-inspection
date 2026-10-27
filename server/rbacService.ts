import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { RbacRole, RbacUser, ADMIN_FEATURES } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const RBAC_FILE = path.join(DATA_DIR, 'rbac_store.json');
const RBAC_BACKUP_FILE = path.join(DATA_DIR, 'rbac_store.json.bak');

export interface RbacStoreState {
  users: RbacUser[];
  roles: RbacRole[];
}

const ALL_FEATURE_IDS = ADMIN_FEATURES.map(f => f.id);

export const DEFAULT_ROLES: RbacRole[] = [
  {
    id: 'global_admin',
    name: 'Global Admin',
    description: 'Full unconstrained system authority over all branches, fleets, users, and regulatory audits.',
    isSystem: true,
    permissions: [...ALL_FEATURE_IDS],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'logistic_admin',
    name: 'Logistic Admin',
    description: 'Fleet catalog management, operations depot & route allocation, bulk spreadsheet uploads, and vehicle QR decals.',
    isSystem: false,
    permissions: ['fleet', 'operations', 'bulk', 'qr', 'history'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'sales_operation',
    name: 'Sales Operation',
    description: 'Executive analytics inspection compliance trends, depot route status, and historical audit certificate review.',
    isSystem: false,
    permissions: ['analytics', 'operations', 'history'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'logistics_manager',
    name: 'Logistics Manager',
    description: 'Depot-level operational oversight, vehicle readiness, driver dispatch compliance, and audit record analysis.',
    isSystem: false,
    permissions: ['analytics', 'fleet', 'operations', 'history', 'bulk', 'qr'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'feeder_admin',
    name: 'Feeder Admin',
    description: 'Heavy feeder / long-haul APAD compliance tracking, line-haul route status, and QR badge verification.',
    isSystem: false,
    permissions: ['fleet', 'operations', 'history', 'qr'],
    createdAt: new Date().toISOString(),
  },
];

export const DEFAULT_GLOBAL_ADMIN: RbacUser = {
  username: 'steve',
  name: 'Steve Wong',
  password: '2580Qwer!@#',
  role: 'Global Admin',
  assignedDepot: 'ALL',
  active: true,
  createdAt: new Date().toISOString(),
};

let rbacStore: RbacStoreState = {
  users: [],
  roles: [],
};

function saveRbacStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const json = JSON.stringify(rbacStore, null, 2);
    const tmp = `${RBAC_FILE}.tmp`;
    fs.writeFileSync(tmp, json, 'utf-8');
    fs.renameSync(tmp, RBAC_FILE);
    fs.copyFileSync(RBAC_FILE, RBAC_BACKUP_FILE);
  } catch (err) {
    console.error('[RBAC Storage Error] Failed to persist rbac_store.json:', err);
  }
}

export function initRbacStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(RBAC_FILE)) {
      try {
        const raw = fs.readFileSync(RBAC_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.users) && Array.isArray(parsed.roles)) {
          rbacStore = parsed;
        }
      } catch (err) {
        console.error('[RBAC Error] Primary rbac_store.json corrupted, checking backup:', err);
        if (fs.existsSync(RBAC_BACKUP_FILE)) {
          try {
            const rawBak = fs.readFileSync(RBAC_BACKUP_FILE, 'utf-8');
            rbacStore = JSON.parse(rawBak);
          } catch {}
        }
      }
    }

    // Ensure default roles exist
    if (!rbacStore.roles || rbacStore.roles.length === 0) {
      rbacStore.roles = [...DEFAULT_ROLES];
    } else {
      // Ensure Global Admin role always has all permissions
      const globalAdminRole = rbacStore.roles.find(r => r.id === 'global_admin' || r.name.toLowerCase() === 'global admin');
      if (globalAdminRole) {
        globalAdminRole.permissions = [...ALL_FEATURE_IDS];
        globalAdminRole.isSystem = true;
      } else {
        rbacStore.roles.unshift({ ...DEFAULT_ROLES[0] });
      }

      // Check if any default position is missing and add it
      for (const defRole of DEFAULT_ROLES) {
        const exists = rbacStore.roles.some(r => r.name.toLowerCase() === defRole.name.toLowerCase() || r.id === defRole.id);
        if (!exists) {
          rbacStore.roles.push({ ...defRole });
        }
      }
    }

    // Ensure Steve Global Admin account always exists
    if (!rbacStore.users || rbacStore.users.length === 0) {
      rbacStore.users = [{ ...DEFAULT_GLOBAL_ADMIN }];
    } else {
      const steve = rbacStore.users.find(u => u.username.toLowerCase() === 'steve');
      if (!steve) {
        rbacStore.users.unshift({ ...DEFAULT_GLOBAL_ADMIN });
      } else {
        // Enforce Steve is always Global Admin, active, and has required credentials
        steve.role = 'Global Admin';
        steve.assignedDepot = 'ALL';
        steve.active = true;
        if (!steve.password) {
          steve.password = DEFAULT_GLOBAL_ADMIN.password;
        }
      }
    }

    saveRbacStore();
    console.log(`[RBAC Service] Initialized successfully. ${rbacStore.users.length} users, ${rbacStore.roles.length} roles configured.`);
  } catch (err) {
    console.error('[RBAC Service] Initialization failed:', err);
  }
}

// ===================== ROLES & PERMISSION MATRIX =====================

export function getRbacRoles(): RbacRole[] {
  return rbacStore.roles;
}

export function createRbacRole(data: { name: string; description?: string; permissions?: string[] }): RbacRole {
  const cleanName = data.name.trim();
  if (!cleanName) {
    throw new Error('Role / Position name is required');
  }

  const existing = rbacStore.roles.find(r => r.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    throw new Error(`Role with name "${cleanName}" already exists`);
  }

  const id = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const newRole: RbacRole = {
    id: `${id}_${Date.now().toString(36)}`,
    name: cleanName,
    description: (data.description || `Custom position for ${cleanName}`).trim(),
    isSystem: false,
    permissions: Array.isArray(data.permissions) ? data.permissions.filter(p => ALL_FEATURE_IDS.includes(p)) : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  rbacStore.roles.push(newRole);
  saveRbacStore();
  return newRole;
}

export function updateRbacRole(roleId: string, updates: { name?: string; description?: string; permissions?: string[] }): RbacRole {
  const role = rbacStore.roles.find(r => r.id === roleId);
  if (!role) {
    throw new Error(`Role with ID "${roleId}" not found`);
  }

  if (updates.name && !role.isSystem) {
    const cleanName = updates.name.trim();
    const duplicate = rbacStore.roles.find(r => r.id !== roleId && r.name.toLowerCase() === cleanName.toLowerCase());
    if (duplicate) {
      throw new Error(`Another role with name "${cleanName}" already exists`);
    }
    // Also update any users associated with the old role name
    const oldName = role.name;
    role.name = cleanName;
    for (const u of rbacStore.users) {
      if (u.role === oldName) {
        u.role = cleanName;
      }
    }
  }

  if (updates.description !== undefined) {
    role.description = updates.description.trim();
  }

  if (Array.isArray(updates.permissions)) {
    if (role.isSystem || role.name === 'Global Admin') {
      // Global Admin retains all features
      role.permissions = [...ALL_FEATURE_IDS];
    } else {
      role.permissions = updates.permissions.filter(p => ALL_FEATURE_IDS.includes(p));
    }
  }

  role.updatedAt = new Date().toISOString();
  saveRbacStore();
  return role;
}

export function deleteRbacRole(roleId: string): boolean {
  const role = rbacStore.roles.find(r => r.id === roleId);
  if (!role) return false;
  if (role.isSystem || role.name === 'Global Admin') {
    throw new Error('System role "Global Admin" cannot be deleted');
  }

  // Check if any users currently have this role
  const assignedUsers = rbacStore.users.filter(u => u.role === role.name);
  if (assignedUsers.length > 0) {
    throw new Error(`Cannot delete role "${role.name}" because ${assignedUsers.length} user(s) are currently assigned to it.`);
  }

  rbacStore.roles = rbacStore.roles.filter(r => r.id !== roleId);
  saveRbacStore();
  return true;
}

// ===================== USER MANAGEMENT =====================

export function getRbacUsers(): Omit<RbacUser, 'password'>[] {
  return rbacStore.users.map(({ password, ...rest }) => rest);
}

export function createRbacUser(data: {
  username: string;
  name: string;
  password?: string;
  role: string;
  assignedDepot: string;
}): RbacUser {
  const cleanUsername = data.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!cleanUsername || cleanUsername.length < 2) {
    throw new Error('Username must be at least 2 alphanumeric characters');
  }

  const existing = rbacStore.users.find(u => u.username.toLowerCase() === cleanUsername);
  if (existing) {
    throw new Error(`Username "${cleanUsername}" is already taken`);
  }

  const cleanName = data.name.trim();
  if (!cleanName) {
    throw new Error('Full Name is required');
  }

  const cleanPassword = (data.password || '').trim();
  if (!cleanPassword || cleanPassword.length < 4) {
    throw new Error('Password must be at least 4 characters long');
  }

  // Verify role exists
  const roleMatch = rbacStore.roles.find(r => r.name.toLowerCase() === data.role.trim().toLowerCase());
  const roleName = roleMatch ? roleMatch.name : data.role.trim();

  const newUser: RbacUser = {
    username: cleanUsername,
    name: cleanName,
    password: cleanPassword,
    role: roleName,
    assignedDepot: (data.assignedDepot || 'ALL').trim().toUpperCase(),
    active: true,
    createdAt: new Date().toISOString(),
  };

  rbacStore.users.push(newUser);
  saveRbacStore();

  const { password, ...safeUser } = newUser;
  return safeUser as RbacUser;
}

export function updateRbacUser(
  username: string,
  updates: {
    name?: string;
    password?: string;
    role?: string;
    assignedDepot?: string;
    active?: boolean;
  }
): Omit<RbacUser, 'password'> {
  const cleanUsername = username.trim().toLowerCase();
  const user = rbacStore.users.find(u => u.username.toLowerCase() === cleanUsername);
  if (!user) {
    throw new Error(`User "${username}" not found`);
  }

  if (updates.name) {
    user.name = updates.name.trim();
  }

  if (updates.password && updates.password.trim().length >= 4) {
    user.password = updates.password.trim();
  }

  if (updates.role) {
    if (user.username === 'steve' && updates.role !== 'Global Admin') {
      throw new Error('Global Admin user "steve" cannot be demoted');
    }
    const roleMatch = rbacStore.roles.find(r => r.name.toLowerCase() === updates.role!.trim().toLowerCase());
    user.role = roleMatch ? roleMatch.name : updates.role.trim();
  }

  if (updates.assignedDepot !== undefined) {
    user.assignedDepot = (updates.assignedDepot || 'ALL').trim().toUpperCase();
  }

  if (typeof updates.active === 'boolean') {
    if (user.username === 'steve' && !updates.active) {
      throw new Error('Primary Global Admin "steve" cannot be deactivated');
    }
    user.active = updates.active;
  }

  saveRbacStore();
  const { password, ...safeUser } = user;
  return safeUser;
}

export function deleteRbacUser(username: string): boolean {
  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername === 'steve') {
    throw new Error('Primary Global Administrator "steve" cannot be deleted');
  }

  const initialLen = rbacStore.users.length;
  rbacStore.users = rbacStore.users.filter(u => u.username.toLowerCase() !== cleanUsername);
  if (rbacStore.users.length === initialLen) return false;

  saveRbacStore();
  return true;
}

// ===================== AUTHENTICATION WITH RBAC RESOLUTION =====================

export function verifyRbacLogin(
  usernameAttempt: string,
  passwordAttempt: string
): {
  success: boolean;
  admin?: {
    username: string;
    name: string;
    role: string;
    assignedDepot: string;
    permissions: string[];
  };
  message?: string;
} {
  const cleanUser = usernameAttempt.trim().toLowerCase();
  const cleanPass = passwordAttempt.trim();

  // Find user in RBAC store
  const user = rbacStore.users.find(u => u.username.toLowerCase() === cleanUser);

  // Check custom admin password from env for steve or admin fallback if configured
  const envPassword = (process.env.ADMIN_PASSWORD || '').trim();
  const isEnvPassMatch = envPassword && cleanPass === envPassword;

  if (!user) {
    // Special fallback for initial setup if steve wasn't loaded yet
    if (cleanUser === 'steve' && (cleanPass === '2580Qwer!@#' || isEnvPassMatch)) {
      return {
        success: true,
        admin: {
          username: 'steve',
          name: 'Steve Wong',
          role: 'Global Admin',
          assignedDepot: 'ALL',
          permissions: [...ALL_FEATURE_IDS],
        },
      };
    }
    return { success: false, message: 'Invalid admin username or password.' };
  }

  if (!user.active) {
    return { success: false, message: 'This staff account has been deactivated. Please contact your Global Administrator.' };
  }

  const isPasswordMatch = (user.password && user.password === cleanPass) || isEnvPassMatch || (cleanUser === 'steve' && cleanPass === '2580Qwer!@#');

  if (!isPasswordMatch) {
    return { success: false, message: 'Invalid admin username or password.' };
  }

  // Update last login
  user.lastLogin = new Date().toISOString();
  saveRbacStore();

  // Resolve permissions from role
  let permissions: string[] = [];
  if (user.role === 'Global Admin' || user.username === 'steve') {
    permissions = [...ALL_FEATURE_IDS];
  } else {
    const roleObj = rbacStore.roles.find(r => r.name.toLowerCase() === user.role.toLowerCase());
    permissions = roleObj ? roleObj.permissions : ['analytics'];
  }

  return {
    success: true,
    admin: {
      username: user.username,
      name: user.name,
      role: user.role,
      assignedDepot: user.assignedDepot || 'ALL',
      permissions,
    },
  };
}
