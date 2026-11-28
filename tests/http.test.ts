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

test('a driver token only lists that driver\'s own inspections; admin sees all', async () => {
  await addVehicle('TST7001');
  await addVehicle('TST7002');
  const a = await addDriver('T950');
  const b = await addDriver('T951');
  assert.equal((await submit(a, 'TST7001')).status, 200);
  assert.equal((await submit(b, 'TST7002')).status, 200);
  const sub = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).sub;

  const mine = await api(srv.base, 'GET', '/api/inspections', { token: a });
  assert.equal(mine.status, 200);
  assert.ok(mine.json.inspections.length >= 1);
  assert.ok(mine.json.inspections.every((r: any) => r.driverId === sub(a)));

  const all = await api(srv.base, 'GET', '/api/inspections', { token: adminToken });
  const ids = new Set(all.json.inspections.map((r: any) => r.driverId));
  assert.ok(ids.has(sub(a)) && ids.has(sub(b)));
});

test('inspection list still fills depot/route and filters by depot', async () => {
  const all = await api(srv.base, 'GET', '/api/inspections', { token: adminToken });
  assert.ok(all.json.inspections.every((r: any) => typeof r.vehicleBranch === 'string' && r.vehicleBranch.length > 0));
  assert.ok(all.json.inspections.every((r: any) => typeof r.route === 'string' && r.route.length > 0));
  const branch = all.json.inspections[0].vehicleBranch;
  const filtered = await api(srv.base, 'GET', `/api/inspections?branch=${encodeURIComponent(branch)}`, { token: adminToken });
  assert.ok(filtered.json.inspections.length > 0);
  assert.ok(filtered.json.inspections.every((r: any) => r.vehicleBranch === branch));
});

test('many drivers behind one shared IP can all log in (limit is per account)', async () => {
  const sharedIp = { 'x-forwarded-for': '10.99.0.1' };
  for (let i = 0; i < 30; i++) {
    const id = `S${1000 + i}`;
    const r = await api(srv.base, 'POST', '/api/drivers/create', {
      token: adminToken,
      body: { loginId: id, employeeId: `E${id}`, name: `Shared ${i}`, password: 'pw-' + id },
    });
    assert.equal(r.status, 200);
  }
  for (let i = 0; i < 30; i++) {
    const id = `S${1000 + i}`;
    const r = await api(srv.base, 'POST', '/api/drivers/login', { headers: sharedIp, body: { loginId: id, password: 'pw-' + id } });
    assert.equal(r.status, 200, `driver ${i} on the shared IP`);
  }
});

test('repeated attempts on ONE account are still rate limited (429)', async () => {
  const ip = { 'x-forwarded-for': '10.99.0.2' };
  const codes: number[] = [];
  for (let i = 0; i < 27; i++) {
    const r = await api(srv.base, 'POST', '/api/admin/login', { headers: ip, body: { username: 'steve', password: 'wrong-' + i } });
    codes.push(r.status);
  }
  assert.ok(codes.slice(0, 25).every((c) => c === 401), codes.join(','));
  assert.equal(codes[26], 429);
  // the same account from another IP, and another account from the same IP, are unaffected
  assert.equal((await api(srv.base, 'POST', '/api/admin/login', { headers: { 'x-forwarded-for': '10.99.0.3' }, body: { username: ADMIN_USER, password: ADMIN_PASS } })).status, 200);
  assert.equal((await api(srv.base, 'POST', '/api/admin/login', { headers: ip, body: { username: 'someone-else', password: 'x' } })).status, 401);
});

test('log download includes the most recent requests (batched log writes are flushed)', async () => {
  const marker = `/api/vehicles/LOGMARKER${Date.now()}`;
  await api(srv.base, 'GET', marker, { token: adminToken });
  const res = await fetch(`${srv.base}/api/system/logs/download`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes(marker), 'latest request line should be in the downloaded log');
});

// ---------- Executive SPV (multi-depot) and editing staff without their password ----------

const rbacUser = async (username: string) => {
  const r = await api(srv.base, 'GET', '/api/rbac/users', { token: adminToken });
  return r.json.users.find((u: any) => u.username === username);
};

test('the Executive SPV role exists by default', async () => {
  const r = await api(srv.base, 'GET', '/api/rbac/roles', { token: adminToken });
  assert.equal(r.status, 200);
  assert.ok(r.json.roles.some((role: any) => role.name === 'Executive SPV'));
});

test('Executive SPV can be assigned several depots; other roles cannot', async () => {
  const created = await api(srv.base, 'POST', '/api/rbac/users', {
    token: adminToken,
    body: { username: 'exec1', name: 'Exec One', password: 'exec-pass-1', role: 'Executive SPV', assignedDepot: ' bl, KL ,bl' },
  });
  assert.equal(created.status, 201);
  assert.equal((await rbacUser('exec1')).assignedDepot, 'BL,KL');

  const rejected = await api(srv.base, 'POST', '/api/rbac/users', {
    token: adminToken,
    body: { username: 'logi1', name: 'Logi One', password: 'logi-pass-1', role: 'Logistic Admin', assignedDepot: 'BL,KL' },
  });
  assert.equal(rejected.status, 400);
  assert.match(rejected.json.error, /Executive SPV/);

  // ALL still works for every role, and a single depot is unchanged
  const single = await api(srv.base, 'POST', '/api/rbac/users', {
    token: adminToken,
    body: { username: 'logi2', name: 'Logi Two', password: 'logi-pass-2', role: 'Logistic Admin', assignedDepot: 'kl' },
  });
  assert.equal(single.status, 201);
  assert.equal((await rbacUser('logi2')).assignedDepot, 'KL');
});

test('editing role, depots and name without a password keeps the user\'s own password', async () => {
  const upd = await api(srv.base, 'PUT', '/api/rbac/users/logi2', {
    token: adminToken,
    body: { name: 'Logi Two Renamed', role: 'Executive SPV', assignedDepot: 'BL,GB', active: true },
  });
  assert.equal(upd.status, 200);
  const u = await rbacUser('logi2');
  assert.equal(u.role, 'Executive SPV');
  assert.equal(u.assignedDepot, 'BL,GB');
  assert.equal(u.name, 'Logi Two Renamed');
  // their original password still logs in
  const login = await api(srv.base, 'POST', '/api/admin/login', { body: { username: 'logi2', password: 'logi-pass-2' } });
  assert.equal(login.status, 200);
  assert.equal(login.json.admin.assignedDepot, 'BL,GB');
});

test('an invalid role/depot change is rejected and changes nothing', async () => {
  const before = await rbacUser('exec1');
  const bad = await api(srv.base, 'PUT', '/api/rbac/users/exec1', {
    token: adminToken,
    body: { name: 'Should Not Apply', role: 'Logistic Admin', assignedDepot: 'BL,KL' },
  });
  assert.equal(bad.status, 400);
  const after = await rbacUser('exec1');
  assert.deepEqual(
    { name: after.name, role: after.role, assignedDepot: after.assignedDepot },
    { name: before.name, role: before.role, assignedDepot: before.assignedDepot }
  );
});

test('an admin can still set a new password when they choose to', async () => {
  const upd = await api(srv.base, 'PUT', '/api/rbac/users/exec1', { token: adminToken, body: { password: 'exec-new-pass' } });
  assert.equal(upd.status, 200);
  assert.equal((await api(srv.base, 'POST', '/api/admin/login', { body: { username: 'exec1', password: 'exec-pass-1' } })).status, 401);
  assert.equal((await api(srv.base, 'POST', '/api/admin/login', { body: { username: 'exec1', password: 'exec-new-pass' } })).status, 200);
});

test('uninspected-drivers report accepts several depots (BL,KL) and one depot as before', async () => {
  for (const [id, depot] of [['U100', 'ZQ1'], ['U101', 'ZQ2'], ['U102', 'ZQ3']]) {
    const r = await api(srv.base, 'POST', '/api/drivers/create', {
      token: adminToken,
      body: { loginId: id, employeeId: `E${id}`, name: `Depot ${depot}`, password: 'pw-' + id, depot },
    });
    assert.equal(r.status, 200);
  }
  const depotsOf = async (q: string) => {
    const r = await api(srv.base, 'GET', `/api/admin/uninspected-drivers?depot=${encodeURIComponent(q)}`, { token: adminToken });
    assert.equal(r.status, 200);
    return new Set(r.json.drivers.map((d: any) => String(d.depot).toUpperCase()));
  };
  assert.deepEqual([...(await depotsOf('ZQ1,ZQ2'))].sort(), ['ZQ1', 'ZQ2']);
  assert.deepEqual([...(await depotsOf('ZQ3'))], ['ZQ3']);
});

// ---------- Photos are written in the background, but on disk before the driver gets "OK" ----------

test('submitted photos are on disk, byte-identical, when the submit returns', async () => {
  await addVehicle('TST8001');
  const dt = await addDriver('T980');
  const bytes = Buffer.from(Array.from({ length: 3000 }, (_, i) => i % 256));
  const dataUrl = 'data:image/jpeg;base64,' + bytes.toString('base64');
  const r = await api(srv.base, 'POST', '/api/inspections', {
    token: dt,
    body: {
      vehicleNo: 'TST8001',
      items: [{ id: 'brake_system', status: 'Pass' }],
      photos: [0, 1].map((slotIndex) => ({ itemId: 'tires_wheels', slotIndex, url: dataUrl })),
    },
  });
  assert.equal(r.status, 200);
  const urls: string[] = r.json.inspection.photos.map((p: any) => p.url);
  assert.equal(urls.length, 2);
  for (const url of urls) {
    // Same naming as before: /uploads/YYYY-MM-DD/PLATE/01_<checkpoint>_slotN.jpg
    assert.match(url, /^\/uploads\/\d{4}-\d{2}-\d{2}\/TST8001\/01_[A-Za-z_]+_slot\d\.jpg$/);
    const res = await fetch(srv.base + url, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(res.status, 200, url);
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(bytes), `${url} content`);
  }
});

test('a rejected submission (vehicle already inspected) writes no photos', async () => {
  await addVehicle('TST8002');
  const first = await addDriver('T981');
  const second = await addDriver('T982');
  assert.equal((await submit(first, 'TST8002')).status, 200); // no photos
  const dataUrl = 'data:image/jpeg;base64,' + Buffer.from('should-not-be-written').toString('base64');
  const rejected = await api(srv.base, 'POST', '/api/inspections', {
    token: second,
    body: { vehicleNo: 'TST8002', items: [{ id: 'brake_system', status: 'Pass' }], photos: [{ itemId: 'tires_wheels', slotIndex: 0, url: dataUrl }] },
  });
  assert.equal(rejected.status, 409);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const res = await fetch(`${srv.base}/uploads/${today}/TST8002/01_Tires_Wheels_slot1.jpg`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.notEqual(res.status, 200);
});

test('a busy depot: 700 pre-login requests a minute from one shared IP are not blocked', async () => {
  const ip = { 'x-forwarded-for': '10.99.0.9' };
  const statuses = await Promise.all(
    Array.from({ length: 700 }, () => fetch(`${srv.base}/api/version`, { headers: ip }).then((r) => r.status))
  );
  assert.equal(statuses.filter((s) => s !== 200).length, 0);
});

test('Saturday full set: the 11th checkpoint (PUSPAKOM & Road Tax) and its photo are saved', async () => {
  const { getActiveInspectionItems } = await import('../src/types');
  await addVehicle('TST9001');
  const dt = await addDriver('T990');
  const items = getActiveInspectionItems({ truckCategory: 'Small Truck' }, true).map((it: any) => ({ ...it, status: 'Pass' }));
  assert.equal(items.length, 11);
  const photo = 'data:image/jpeg;base64,' + Buffer.from('pusp').toString('base64');
  const r = await api(srv.base, 'POST', '/api/inspections', {
    token: dt,
    body: {
      vehicleNo: 'TST9001', overallResult: 'Pass', odometer: 1000, items,
      photos: items.map((it: any) => ({ itemId: it.id, itemTitle: it.title, slotIndex: 0, url: photo })),
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.inspection.items.length, 11);
  assert.ok(r.json.inspection.items.some((i: any) => i.id === 'puspakum_roadtax' && i.code === 11));
  const puspPhoto = r.json.inspection.photos.find((p: any) => p.itemId === 'puspakum_roadtax');
  assert.match(puspPhoto.url, /\/11_[A-Za-z0-9_]+\.jpg$/);
  // and the admin list returns it with all 11 items
  const list = await api(srv.base, 'GET', '/api/inspections', { token: adminToken });
  const saved = list.json.inspections.find((x: any) => x.id === r.json.inspection.id);
  assert.equal(saved.items.length, 11);
});
