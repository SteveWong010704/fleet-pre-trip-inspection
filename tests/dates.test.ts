import test from 'node:test';
import assert from 'node:assert/strict';
import { getCalendarDateString, isSameDay } from '../server/storage';

// Reference: what the code produced before the formatter was shared and cached
const reference = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

test('ISO timestamps convert to the Kuala Lumpur calendar date (same as before)', () => {
  const samples = [
    '2026-11-25T15:59:59.999Z', // 23:59:59 KL on the 25th
    '2026-11-25T16:00:00.000Z', // 00:00 KL on the 26th
    '2026-01-01T00:00:00Z',
    '2026-11-26T08:30:00+08:00',
  ];
  for (const s of samples) {
    assert.equal(getCalendarDateString(s), reference(new Date(s)), s);
    // second call is served from the cache and must be identical
    assert.equal(getCalendarDateString(s), reference(new Date(s)), `${s} (cached)`);
  }
  assert.equal(getCalendarDateString('2026-11-25T16:00:00.000Z'), '2026-11-26');
});

test('Date objects, DD/MM/YYYY strings and records keep their existing behaviour', () => {
  const d = new Date('2026-11-25T18:00:00Z');
  assert.equal(getCalendarDateString(d), reference(d));
  assert.equal(getCalendarDateString('26/11/2026, 08:30:00'), '2026-11-26');
  assert.equal(getCalendarDateString('2026-11-26'), '2026-11-26');
  assert.equal(getCalendarDateString({ formattedDate: '05/11/2026, 07:00:00' }), '2026-11-05');
  assert.equal(getCalendarDateString({ timestamp: '2026-11-25T16:00:00.000Z' }), '2026-11-26');
  assert.equal(getCalendarDateString('not a date'), '');
  assert.equal(getCalendarDateString(''), '');
});

test('isSameDay compares in Kuala Lumpur time', () => {
  assert.equal(isSameDay('2026-11-25T16:00:00.000Z', '2026-11-26'), true);
  assert.equal(isSameDay('2026-11-25T15:59:59.000Z', '2026-11-26'), false);
});
