import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Route, Truck, MapPin } from 'lucide-react';
import { fetchVehicles } from '../../lib/api';
import { Vehicle } from '../../types';

const DEPOTS_BY_REGION: Record<string, string[]> = {
  NORTHERN: ['PG', 'IP', 'MN', 'LN'],
  CENTRAL: ['KJ', 'GB', 'BL', 'KL', 'NL'],
  EAST: [],
  SOUTH: ['AG', 'SB', 'JB'],
};

export const RouteDepotManagement: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try { setVehicles(await fetchVehicles()); }
    catch (e: any) { setError(e?.message || 'Unable to load depot and route assignments.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const depotRows = useMemo(() => {
    const result: { region: string; depot: string; vehicles: Vehicle[]; routes: { route: string; plates: string[] }[] }[] = [];
    for (const [region, depots] of Object.entries(DEPOTS_BY_REGION)) {
      if (regionFilter !== 'ALL' && regionFilter !== region) continue;
      for (const depot of depots) {
        const assigned = vehicles.filter(v => String(v.branch || '').trim().toUpperCase() === depot);
        const routeMap = new Map<string, string[]>();
        assigned.forEach(v => {
          const route = String(v.assignedRoute || v.area || '').trim().toUpperCase() || 'UNASSIGNED';
          routeMap.set(route, [...(routeMap.get(route) || []), v.vehicleNo]);
        });
        result.push({ region, depot, vehicles: assigned, routes: Array.from(routeMap.entries()).map(([route, plates]) => ({ route, plates })).sort((a,b) => a.route.localeCompare(b.route)) });
      }
    }
    return result;
  }, [vehicles, regionFilter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-xl font-black text-slate-900">Region, Depot & Route Management</h2><p className="mt-1 text-sm text-slate-500">The roster is derived from current vehicle assignments, so edits and depot moves are reflected on refresh.</p></div>
        <div className="flex gap-2">
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><option value="ALL">All regions</option>{Object.keys(DEPOTS_BY_REGION).map(r => <option key={r}>{r}</option>)}</select>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><RefreshCw className="h-4 w-4" /> Refresh</button>
        </div>
      </div>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading assignments…</div> :
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {depotRows.map(row => <section key={row.depot} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-3"><div className="rounded-xl bg-blue-100 p-2 text-blue-700"><MapPin className="h-5 w-5" /></div><div><h3 className="font-black text-slate-900">{row.depot}</h3><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{row.region} region</p></div></div>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">{row.vehicles.length} vehicles</span>
            </header>
            <div className="space-y-3 p-4">
              {!row.vehicles.length ? <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">No vehicles assigned to this depot.</p> :
                row.routes.map(route => <div key={route.route} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-black text-slate-800"><Route className="h-4 w-4 text-slate-400" /> {route.route}<span className="ml-auto text-[10px] font-semibold text-slate-400">{route.plates.length} assigned</span></div>
                  <div className="flex flex-wrap gap-1.5">{route.plates.map(plate => <span key={plate} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700"><Truck className="h-3 w-3" />{plate}</span>)}</div>
                </div>)
              }
            </div>
          </section>)}
        </div>
      }
      <p className="text-[11px] text-slate-400">Routes are currently represented by each vehicle’s assignedRoute/area field rather than a separate route table. A route without any vehicle assignment is not persisted as a standalone entity yet.</p>
    </div>
  );
};
