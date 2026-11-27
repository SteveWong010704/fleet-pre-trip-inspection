import test from 'node:test';
import assert from 'node:assert/strict';
import { getInspectionDateKey, formatLocalDateKey } from '../server/analyticsService';

const reference = (d: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const p = (t: string) => parts.find((x) => x.type === t)?.value || '';
  return `${p('year')}-${p('month')}-${p('day')}`;
};

test('analytics date keys are unchanged (shared formatter)', () => {
  for (const s of ['2026-11-25T15:59:59Z', '2026-11-25T16:00:00Z', '2026-02-28T20:00:00Z']) {
    assert.equal(formatLocalDateKey(new Date(s)), reference(new Date(s)), s);
    assert.equal(getInspectionDateKey({ timestamp: s }), reference(new Date(s)), s);
  }
  assert.equal(getInspectionDateKey({ formattedDate: '26/11/2026, 08:30:00' }), '2026-11-26');
  assert.equal(getInspectionDateKey({ id: 'INSP-20261105-0001' }), '2026-11-05');
});
