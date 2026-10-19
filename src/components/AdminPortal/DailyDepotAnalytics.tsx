import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, FileSpreadsheet, FileText, RefreshCw, BarChart3, Table2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { fetchInspections, fetchVehicles } from '../../lib/api';
import { InspectionRecord, Vehicle } from '../../types';

type DailyDepotRow = {
  date: string;
  depot: string;
  assigned: number;
  inspected: number;
  passed: number;
  defects: number;
  missed: number;
  compliance: number;
};

const REGION_BY_DEPOT: Record<string, string> = {
  KJ: 'CENTRAL', GB: 'CENTRAL', BL: 'CENTRAL', KL: 'CENTRAL', AG: 'SOUTH',
  JB: 'SOUTH', SB: 'SOUTH', NL: 'SOUTH', PG: 'NORTHERN', IP: 'NORTHERN',
  MN: 'NORTHERN', LN: 'NORTHERN',
};

const dateString = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export const DailyDepotAnalytics: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [fromDate, setFromDate] = useState(() => dateString(new Date(Date.now() - 6 * 86400000)));
  const [toDate, setToDate] = useState(() => dateString(new Date()));
  const [depotFilter, setDepotFilter] = useState('ALL');
  const [view, setView] = useState<'table' | 'chart'>('table');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [v, i] = await Promise.all([
        fetchVehicles(),
        fetchInspections({ dateFrom: fromDate, dateTo: toDate }),
      ]);
      setVehicles(v);
      setInspections(i);
    } catch (e: any) {
      setError(e?.message || 'Unable to load depot analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [fromDate, toDate]);

  const depots = useMemo(() => Array.from(new Set([
    ...vehicles.map(v => String(v.branch || '').trim().toUpperCase()),
    ...inspections.map(i => String(i.vehicleBranch || i.driverDepot || '').trim().toUpperCase()),
  ].filter(Boolean))).sort(), [vehicles, inspections]);

  const rows = useMemo(() => {
    if (!fromDate || !toDate || fromDate > toDate) return [];
    const dates: string[] = [];
    const cursor = new Date(fromDate + 'T12:00:00');
    const end = new Date(toDate + 'T12:00:00');
    for (let count = 0; cursor <= end && count < 367; count++, cursor.setDate(cursor.getDate() + 1)) {
      dates.push(dateString(cursor));
    }
    const activeDepots = depotFilter === 'ALL' ? depots : depots.filter(d => d === depotFilter);
    const result: DailyDepotRow[] = [];
    for (const date of dates) {
      for (const depot of activeDepots) {
        const assigned = vehicles.filter(v => String(v.branch || '').trim().toUpperCase() === depot).length;
        const daily = inspections.filter(i => {
          const recordDate = dateString(new Date(i.timestamp));
          const recordDepot = String(i.vehicleBranch || i.driverDepot || '').trim().toUpperCase();
          return recordDate === date && recordDepot === depot;
        });
        const uniqueInspected = new Set(daily.map(i => String(i.vehicleNo || '').replace(/\s+/g, '').toUpperCase()));
        const inspected = uniqueInspected.size;
        const passed = daily.filter(i => i.overallResult === 'Pass').length;
        const defects = daily.filter(i => i.overallResult === 'Fail').length;
        result.push({
          date, depot, assigned, inspected, passed, defects,
          missed: Math.max(0, assigned - inspected),
          compliance: assigned ? Math.round((Math.min(assigned, inspected) / assigned) * 1000) / 10 : 0,
        });
      }
    }
    return result;
  }, [fromDate, toDate, depotFilter, depots, vehicles, inspections]);

  const exportExcel = () => {
    if (!rows.length) return;
    const workbook = XLSX.utils.book_new();
    const data = rows.map(r => ({
      Date: r.date, Region: REGION_BY_DEPOT[r.depot] || 'UNMAPPED', 'Depot Code': r.depot,
      'Assigned Vehicles': r.assigned, 'Daily Inspected Count': r.inspected,
      Passed: r.passed, 'Defects / Grounded': r.defects, 'Missed Inspections': r.missed,
      'Daily Compliance %': r.compliance,
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), 'Daily Depot Breakdown');
    XLSX.writeFile(workbook, `FOMS_Daily_Depot_Analytics_${fromDate}_to_${toDate}.xlsx`);
  };

  const exportPdf = () => {
    if (!rows.length) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(15);
    doc.text('FOMS Executive Daily Depot Analytics', 14, 15);
    doc.setFontSize(9);
    doc.text(`Period: ${fromDate} to ${toDate} | Source: current fleet and inspection records`, 14, 22);
    autoTable(doc, {
      startY: 27,
      head: [['Date', 'Region', 'Depot', 'Assigned', 'Inspected', 'Passed', 'Defects / Grounded', 'Missed', 'Compliance %']],
      body: rows.map(r => [r.date, REGION_BY_DEPOT[r.depot] || 'UNMAPPED', r.depot, r.assigned, r.inspected, r.passed, r.defects, r.missed, `${r.compliance}%`]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 110] },
    });
    doc.save(`FOMS_Daily_Depot_Analytics_${fromDate}_to_${toDate}.pdf`);
  };

  const maxCount = Math.max(1, ...rows.map(r => r.assigned));

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">Executive Daily Depot Analytics</h2>
          <p className="text-sm text-slate-500 mt-1">Daily inspection compliance by depot. Empty periods remain empty; no synthetic records are generated.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setView(view === 'table' ? 'chart' : 'table')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            {view === 'table' ? <BarChart3 className="w-4 h-4" /> : <Table2 className="w-4 h-4" />}
            {view === 'table' ? 'Chart View' : 'Table View'}
          </button>
          <button onClick={exportExcel} disabled={!rows.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </button>
          <button onClick={exportPdf} disabled={!rows.length} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
            <FileText className="w-4 h-4" /> Export PDF
          </button>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-bold text-slate-600">From date
          <span className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"><CalendarDays className="h-4 w-4 text-slate-400" /><input type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)} className="w-full text-sm outline-none" /></span>
        </label>
        <label className="text-xs font-bold text-slate-600">To date
          <span className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"><CalendarDays className="h-4 w-4 text-slate-400" /><input type="date" value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)} className="w-full text-sm outline-none" /></span>
        </label>
        <label className="text-xs font-bold text-slate-600">Depot
          <select value={depotFilter} onChange={e => setDepotFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            <option value="ALL">All depots side by side</option>
            {depots.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading real inspection records…</div>
        : !rows.length ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No records found for the selected date range and depot.</div>
        : view === 'table' ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr>
                {['Date', 'Region', 'Depot Code', 'Assigned Vehicles', 'Daily Inspected Count', 'Passed', 'Defects / Grounded', 'Missed Inspections', 'Daily Compliance %'].map(h => <th key={h} className="whitespace-nowrap px-4 py-3 font-black">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{rows.map((r, idx) => <tr key={r.date + r.depot + idx} className={r.missed > 0 ? 'bg-amber-50/50' : ''}>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{r.date}</td><td className="px-4 py-3 text-slate-500">{REGION_BY_DEPOT[r.depot] || 'UNMAPPED'}</td><td className="px-4 py-3 font-black text-slate-800">{r.depot}</td>
                <td className="px-4 py-3 tabular-nums">{r.assigned}</td><td className="px-4 py-3 tabular-nums">{r.inspected}</td><td className="px-4 py-3 font-bold text-emerald-700">{r.passed}</td><td className="px-4 py-3 font-bold text-rose-700">{r.defects}</td><td className="px-4 py-3 font-bold text-amber-700">{r.missed}</td><td className="px-4 py-3 font-black">{r.compliance}%</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            {rows.map((r, idx) => <div key={r.date + r.depot + idx} className="space-y-1.5">
              <div className="flex justify-between gap-3 text-xs"><span className="font-bold text-slate-700">{r.date} · {r.depot}</span><span className="text-slate-500">{r.inspected}/{r.assigned} inspected · {r.compliance}%</span></div>
              <div className="flex h-5 overflow-hidden rounded-md bg-slate-100">
                <div title="Inspected" className="bg-emerald-500" style={{ width: `${Math.min(100, r.inspected / maxCount * 100)}%` }} />
                <div title="Missed" className="bg-amber-400" style={{ width: `${Math.min(100, r.missed / maxCount * 100)}%` }} />
              </div>
              <div className="flex gap-4 text-[10px] text-slate-500"><span>Passed: {r.passed}</span><span>Defects: {r.defects}</span><span>Missed: {r.missed}</span></div>
            </div>)}
            <p className="text-[10px] text-slate-400">Bar segments show inspected and missed vehicles against the largest assigned-vehicle count in the filtered view.</p>
          </div>
        )}
    </div>
  );
};
