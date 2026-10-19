import React, { useState } from 'react';
import { AlertTriangle, ShieldCheck, Trash2 } from 'lucide-react';
import { purgeDemoData } from '../../lib/api';

export const DataMaintenance: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const runPurge = async () => {
    const confirmed = window.confirm(
      'Purge only positively identified legacy demo vehicles and drivers, plus inspections explicitly tagged DEMO/MOCK/SEED/TEST? Real records and untagged inspection history will be preserved. Continue?'
    );
    if (!confirmed) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await purgeDemoData();
      setResult({ success: true, message: response.message });
    } catch (error: any) {
      setResult({ success: false, message: error?.message || 'Demo data purge failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-black text-slate-900">Real Data & Maintenance</h2>
        <p className="mt-1 text-sm text-slate-500">Control legacy demo data without wiping operational records.</p>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
          <div>
            <h3 className="font-black text-amber-950">Purge Identified Demo Data</h3>
            <p className="mt-2 text-sm leading-6 text-amber-900">
              Removes only legacy seeded vehicles/drivers whose stable identifying fields still match the bundled seed records, and inspection records whose IDs begin with DEMO-, MOCK-, SEED- or TEST-. Normal inspection history is not deleted. New records must come from authorized entry, CSV import or the configured database.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={() => void runPurge()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-black text-white shadow-sm disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> {busy ? 'Purging…' : 'Purge Identified Demo Data'}
              </button>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900"><ShieldCheck className="h-4 w-4" /> Admin-only · targeted deletion</span>
            </div>
          </div>
        </div>
      </div>
      {result && <div className={`rounded-xl border p-4 text-sm ${result.success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{result.message}</div>}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-slate-800">Important</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>This action does not call the existing full database wipe endpoint.</li>
          <li>Unmarked historical inspections are intentionally preserved because their provenance cannot be safely inferred.</li>
          <li>Take a normal server/database backup before any production data cleanup.</li>
        </ul>
      </div>
    </div>
  );
};
