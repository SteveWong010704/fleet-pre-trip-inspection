import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, isHashedPassword, safeEqual, passwordForStorage } from '../server/passwordHash';

test('hashPassword produces a verifiable scrypt hash', async () => {
  const h = await hashPassword('s3cret!');
  assert.ok(isHashedPassword(h));
  assert.deepEqual(await verifyPassword(h, 's3cret!'), { ok: true, legacy: false });
  assert.equal((await verifyPassword(h, 'wrong')).ok, false);
});

test('two hashes of the same password differ (random salt)', async () => {
  assert.notEqual(await hashPassword('same'), await hashPassword('same'));
});

test('legacy plaintext is accepted and flagged for upgrade', async () => {
  assert.deepEqual(await verifyPassword('plain123', 'plain123'), { ok: true, legacy: true });
  assert.deepEqual(await verifyPassword('plain123', 'nope'), { ok: false, legacy: true });
});

test('a malformed hash never throws and never matches', async () => {
  assert.deepEqual(await verifyPassword('scrypt$garbage', 'x'), { ok: false, legacy: false });
});

test('safeEqual compares strings of any length', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('', ''), true);
});

test('passwordForStorage stores plaintext unless HASH_PASSWORDS=true', async () => {
  const prev = process.env.HASH_PASSWORDS;
  try {
    process.env.HASH_PASSWORDS = '';
    assert.equal(await passwordForStorage('abc12345'), 'abc12345');
    process.env.HASH_PASSWORDS = 'true';
    assert.ok(isHashedPassword(await passwordForStorage('abc12345')));
  } finally {
    process.env.HASH_PASSWORDS = prev ?? '';
  }
});
