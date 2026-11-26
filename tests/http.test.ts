import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, TestServer, ADMIN_USER, ADMIN_PASS, MASTER_PASS } from './helpers/server';

let srv: TestServer;
let adminToken = '';

const pass = (id: string) => ({ id, status: 'Pass' });

async function addVehicle(plate: string) {
  const r = await api(srv.base, 'POST', '/api/vehicles/create', { token: adminToken, body: { vehicleNo: plate } });
  assert.equal(r.status, 200, `create vehicle ${plate}`);
}

async function addDriver(loginId: string, designation = '') {
  const r = await api(srv.base, 'POST', '/api/drivers/create', {
    token: adminToken,
    body: { loginId, employeeId: `E${loginId}`, name: `Driver ${loginId}`, password: 'pw-' + loginId, designation },
  });
  assert.equal(r.status, 200, `create driver ${loginId}`);
  const login = await api(srv.base, 'POST', '/api/drivers/login', { body: { loginId, password: 'pw-' + loginId } });
  assert.equal(login.status, 200, `login driver ${loginId}`);
  return login.json.token as string;
}

const submit = (token: string, plate: string, items: unknown[] = [pass('brake_system')]) =>
  api(srv.base, 'POST', '/api/inspections', { token, body: { vehicleNo: plate, items } });

before(async () => {
  srv = await startServer();
  const r = await api(srv.base, 'POST', '/api/admin/login', { body: { username: ADMIN_USER, password: ADMIN_PASS } });
  assert.equal(r.status, 200);
  adminToken = r.json.token;
});

after(async () => {
  await srv?.stop();
});

test('health endpoint is public', async () => {
  assert.equal((await api(srv.base, 'GET', '/api/health')).status, 200);
});

test('admin login: wrong password 401, missing fields 400, right password returns a token', async () => {
  assert.equal((await api(srv.base, 'POST', '/api/admin/login', { body: { username: ADMIN_USER, password: 'nope' } })).status, 401);
  assert.equal((await api(srv.base, 'POST', '/api/admin/login', { body: { username: ADMIN_USER } })).status, 400);
  assert.ok(adminToken.split('.').length === 3);
});

test('protected endpoints reject requests without a token', async () => {
  for (const url of ['/api/stats', '/api/rbac/roles', '/api/operations/regions', '/api/backup/status', '/api/audit-logs', '/api/inspections']) {
    assert.equal((await api(srv.base, 'GET', url)).status, 401, url);
  }
});

test('driver token cannot use admin endpoints (403) but admin can', async () => {
  const dt = await addDriver('T100');
  assert.equal((await api(srv.base, 'GET', '/api/rbac/roles', { token: dt })).status, 403);
  assert.equal((await api(srv.base, 'POST', '/api/drivers/create', { token: dt, body: {} })).status, 403);
  assert.equal((await api(srv.base, 'GET', '/api/rbac/roles', { token: adminToken })).status, 200);
});

test('driver login never returns the password, and rejects a wrong one', async () => {
  await addDriver('T101');
  const ok = await api(srv.base, 'POST', '/api/drivers/login', { body: { loginId: 'T101', password: 'pw-T101' } });
  assert.equal(ok.status, 200);
  assert.ok(!JSON.stringify(ok.json).includes('pw-T101'));
  const bad = await api(srv.base, 'POST', '/api/drivers/login', { body: { loginId: 'T101', password: 'wrong' } });
  assert.equal(bad.status, 401);
});

test('regular driver: one inspection per day, repeat is 409', async () => {
  await addVehicle('TST1001');
  await addVehicle('TST1002');
  const dt = await addDriver('T200');
  assert.equal((await submit(dt, 'TST1001')).status, 200);
  assert.equal((await submit(dt, 'TST1002')).status, 409);
  const status = await api(srv.base, 'GET', '/api/drivers/daily-check/T200');
  assert.equal(status.json.hasInspectedToday, true);
  assert.equal(status.json.hasReachedLimit, true);
});

test('a truck already inspected today cannot be inspected again by another regular driver', async () => {
  await addVehicle('TST2001');
  const a = await addDriver('T300');
  const b = await addDriver('T301');
  assert.equal((await submit(a, 'TST2001')).status, 200);
  assert.equal((await submit(b, 'TST2001')).status, 409);
});

test('supervisor may do up to 3 inspections per day, the 4th is 409', async () => {
  for (const p of ['TST3001', 'TST3002', 'TST3003', 'TST3004']) await addVehicle(p);
  const spv = await addDriver('T400', 'Supervisor');
  assert.equal((await submit(spv, 'TST3001')).status, 200);
  assert.equal((await submit(spv, 'TST3002')).status, 200);
  assert.equal((await submit(spv, 'TST3003')).status, 200);
  assert.equal((await submit(spv, 'TST3004')).status, 409);
});

test('a failed checkpoint without a remark is rejected (400)', async () => {
  await addVehicle('TST4001');
  const dt = await addDriver('T500');
  const r = await submit(dt, 'TST4001', [{ id: 'brake_system', status: 'Fail' }]);
  assert.equal(r.status, 400);
  const withRemark = await submit(dt, 'TST4001', [{ id: 'brake_system', status: 'Fail', defectNote: 'leaking' }]);
  assert.equal(withRemark.status, 200);
});

test('inspection for an unknown vehicle is rejected (400) and no token is 401', async () => {
  const dt = await addDriver('T600');
  assert.equal((await submit(dt, 'NO-SUCH-TRUCK')).status, 400);
  assert.equal((await api(srv.base, 'POST', '/api/inspections', { body: { vehicleNo: 'X' } })).status, 401);
});

test('the server overrides driver identity with the token (no impersonation)', async () => {
  await addVehicle('TST5001');
  const dt = await addDriver('T700');
  const r = await api(srv.base, 'POST', '/api/inspections', {
    token: dt,
    body: { vehicleNo: 'TST5001', driverId: 'SOMEONE-ELSE', driverName: 'Mallory', items: [pass('brake_system')] },
  });
  assert.equal(r.status, 200);
  const sub = JSON.parse(Buffer.from(dt.split('.')[1], 'base64url').toString()).sub;
  assert.equal(r.json.inspection.driverId, sub);
  assert.notEqual(r.json.inspection.driverId, 'SOMEONE-ELSE');
});

test('inspection ids are unique', async () => {
  const list = await api(srv.base, 'GET', '/api/inspections', { token: adminToken });
  assert.equal(list.status, 200);
  const rows: any[] = Array.isArray(list.json) ? list.json : list.json.inspections || list.json.data || [];
  assert.ok(rows.length >= 5, `expected several inspections, got ${rows.length}`);
  const ids = rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('admin and driver tokens differ in role', async () => {
  const payload = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
  assert.equal(payload(adminToken).role, 'admin');
  assert.equal(payload(await addDriver('T800')).role, 'driver');
});

test('backup status is admin-only and responds', async () => {
  assert.equal((await api(srv.base, 'GET', '/api/backup/status')).status, 401);
  const r = await api(srv.base, 'GET', '/api/backup/status', { token: adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
});

test('destructive endpoints require the master password', async () => {
  assert.equal((await api(srv.base, 'DELETE', '/api/inspections', { token: adminToken })).status, 403);
  assert.equal(
    (await api(srv.base, 'DELETE', '/api/inspections', { token: adminToken, headers: { 'x-security-password': 'wrong' } })).status,
    403
  );
  const ok = await api(srv.base, 'DELETE', '/api/inspections', { token: adminToken, headers: { 'x-security-password': MASTER_PASS } });
  assert.equal(ok.status, 200);
});

test('/api/version is public and returns a version string', async () => {
  const r = await api(srv.base, 'GET', '/api/version');
  assert.equal(r.status, 200);
  assert.equal(typeof r.json.version, 'string');
  assert.ok(r.json.version.length > 0);
});

test('vehicle list status follows today\'s inspection: Pending -> Ready, Pending -> Grounded', async () => {
  await addVehicle('TST6001');
  await addVehicle('TST6002');
  const statusOf = async (plate: string) => {
    const r = await api(srv.base, 'GET', '/api/vehicles', { token: adminToken });
    assert.equal(r.status, 200);
    return r.json.vehicles.find((v: any) => v.vehicleNo === plate)?.currentStatus;
  };
  assert.equal(await statusOf('TST6001'), 'Pending Inspection');
  assert.equal(await statusOf('TST6002'), 'Pending Inspection');

  const a = await addDriver('T900');
  const b = await addDriver('T901');
  const pass = await api(srv.base, 'POST', '/api/inspections', {
    token: a,
    body: { vehicleNo: 'TST6001', overallResult: 'Pass', items: [{ id: 'brake_system', status: 'Pass' }] },
  });
  assert.equal(pass.status, 200);
  const fail = await api(srv.base, 'POST', '/api/inspections', {
    token: b,
    body: { vehicleNo: 'TST6002', overallResult: 'Fail', items: [{ id: 'brake_system', status: 'Fail', defectNote: 'leak' }] },
  });
  assert.equal(fail.status, 200);

  assert.equal(await statusOf('TST6001'), 'Ready');
  assert.equal(await statusOf('TST6002'), 'Grounded');
  // Filtering by status uses the same computed value
  const ready = await api(srv.base, 'GET', '/api/vehicles?status=Ready', { token: adminToken });
  assert.ok(ready.json.vehicles.some((v: any) => v.vehicleNo === 'TST6001'));
  assert.ok(!ready.json.vehicles.some((v: any) => v.vehicleNo === 'TST6002'));
});
