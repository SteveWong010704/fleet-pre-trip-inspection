import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Route as RouteIcon, Truck, MapPin, Search, Building2, Layers3 } from 'lucide-react';
import { fetchVehicles } from '../../lib/api';
import { Vehicle } from '../../types';

const DEPOTS_BY_REGION: Record<string, string[]> = {
  NORTHERN: ['PG', 'IP', 'MN', 'LN'],
  CENTRAL: ['KJ', 'GB', 'BL', 'KL', 'NL'],
  EAST: [],
  SOUTH: ['AG', 'SB', 'JB'],
};

type ViewTab = 'regions' | 'depots' | 'routes';

const normalise = (value?: string) => String(value || '').trim().toUpperCase();
const getDepot = (vehicle: Vehicle) => normalise(vehicle.branch);
const getRoute = (vehicle: Vehicle) => normalise(vehicle.assignedRoute || vehicle.area) || 'UNASSIGNED';

export const RouteDepotManagement: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>('regions');
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [depotFilter, setDepotFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setVehicles(await fetchVehicles());
    } catch (e: any) {
      setError(e?.message || 'Unable to load depot and route assignments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const regionForDepot = (depot: string) =>
    Object.entries(DEPOTS_BY_REGION).find(([, depots]) => depots.includes(depot))?.[0] || 'UNMAPPED';

  const depotRows = useMemo(() => {
    const allDepotCodes = new Set([
      ...Object.values(DEPOTS_BY_REGION).flat(),
      ...vehicles.map(getDepot).filter(Boolean),
    ]);
    return Array.from(allDepotCodes).sort().map(depot => {
      const assigned = vehicles.filter(v => getDepot(v) === depot);
      const routeNames = new Set(assigned.map(getRoute));
      return { depot, region: regionForDepot(depot), vehicles: assigned, routeCount: routeNames.size };
    }).filter(row => regionFilter === 'ALL' || row.region === regionFilter)
      .filter(row => !search || row.depot.toLowerCase().includes(search.toLowerCase()) || row.region.toLowerCase().includes(search.toLowerCase()));
  }, [vehicles, regionFilter, search]);

  const routeRows = useMemo(() => {
    const map = new Map<string, { route: string; depot: string; region: string; vehicles: Vehicle[] }>();
    vehicles.forEach(vehicle => {
      const depot = getDepot(vehicle) || 'UNASSIGNED DEPOT';
      const route = getRoute(vehicle);
      const key = `${depot}::${route}`;
      const current = map.get(key) || { route, depot, region: regionForDepot(depot), vehicles: [] };
      current.vehicles.push(vehicle);
      map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => a.depot.localeCompare(b.depot) || a.route.localeCompare(b.route))
      .filter(row => regionFilter === 'ALL' || row.region === regionFilter)
      .filter(row => depotFilter === 'ALL' || row.depot === depotFilter)
      .filter(row => !search || row.route.toLowerCase().includes(search.toLowerCase()) || row.depot.toLowerCase().includes(search.toLowerCase()) || row.vehicles.some(v => v.vehicleNo.toLowerCase().includes(search.toLowerCase())));
  }, [vehicles, regionFilter, depotFilter, search]);

  const regionRows = useMemo(() => Object.keys(DEPOTS_BY_REGION).map(region => {
    const knownDepots = new Set([
      ...DEPOTS_BY_REGION[region],
      ...vehicles.map(getDepot).filter(depot => depot && regionForDepot(depot) === region),
    ]);
    const regionVehicles = vehicles.filter(v => regionForDepot(getDepot(v)) === region);
    return { region, depotCount: knownDepots.size, vehicleCount: regionVehicles.length };
  }).filter(row => regionFilter === 'ALL' || row.region === regionFilter)
    .filter(row => !search || row.region.toLowerCase().includes(search.toLowerCase())), [vehicles, regionFilter, search]);

  const tabs: { id: ViewTab; label: string; description: string; count: number; icon: React.ReactNode }[] = [
    { id: 'regions', label: 'Regions', description: 'Overview by region', count: Object.keys(DEPOTS_BY_REGION).length, icon: <Layers3 className="h-4 w-4" /> },
    { id: 'depots', label: 'Depots', description: 'Depot roster and capacity', count: depotRows.length, icon: <Building2 className="h-4 w-4" /> },
    { id: 'routes', label: 'Routes & Vehicles', description: 'Current route assignments', count: routeRows.length, icon: <RouteIcon className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Fleet structure</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Region, Depot & Route Management</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Browse one level at a time. Counts are calculated from current vehicle assignments.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh data
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Regions</p><p className="mt-1 text-2xl font-black text-slate-900">{Object.keys(DEPOTS_BY_REGION).length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Depots in view</p><p className="mt-1 text-2xl font-black text-slate-900">{depotRows.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Vehicles loaded</p><p className="mt-1 text-2xl font-black text-slate-900">{vehicles.length}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-50'}`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${activeTab === tab.id ? 'bg-white/15' : 'bg-slate-100 text-slate-600'}`}>{tab.icon}</span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{tab.label}</span><span className={`mt-0.5 block text-xs ${activeTab === tab.id ? 'text-blue-100' : 'text-slate-500'}`}>{tab.description}</span></span>
              <span className={`rounded-full px-2 py-1 text-xs font-bold ${activeTab === tab.id ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search region, depot, route or vehicle</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search region, depot, route or vehicle…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </label>
        <select value={regionFilter} onChange={e => { setRegionFilter(e.target.value); setDepotFilter('ALL'); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">
          <option value="ALL">All regions</option>{Object.keys(DEPOTS_BY_REGION).map(region => <option key={region} value={region}>{region}</option>)}
        </select>
        {activeTab === 'routes' && (
          <select value={depotFilter} onChange={e => setDepotFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">
            <option value="ALL">All depots</option>{depotRows.map(row => <option key={row.depot} value={row.depot}>{row.depot}</option>)}
          </select>
        )}
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading current fleet assignments…</div> : (
        <div className="space-y-3">
          {activeTab === 'regions' && regionRows.map(row => (
            <button key={row.region} onClick={() => { setRegionFilter(row.region); setActiveTab('depots'); }} className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md sm:flex-row sm:items-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><MapPin className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-base font-black text-slate-900">{row.region}</span><span className="mt-1 block text-xs text-slate-500">Select to view the depots in this region</span></span>
              <span className="flex gap-5 sm:gap-8"><span><span className="block text-lg font-black text-slate-900">{row.depotCount}</span><span className="text-xs text-slate-500">Depots</span></span><span><span className="block text-lg font-black text-slate-900">{row.vehicleCount}</span><span className="text-xs text-slate-500">Vehicles</span></span></span>
            </button>
          ))}

          {activeTab === 'depots' && (
            depotRows.length ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:px-5"><span>Depot</span><span>Routes</span><span>Vehicles</span></div>
              {depotRows.map(row => (
                <button key={row.depot} onClick={() => { setDepotFilter(row.depot); setActiveTab('routes'); }} className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-slate-100 px-4 py-4 text-left last:border-0 hover:bg-blue-50/40 sm:px-5">
                  <span><span className="block font-black text-slate-900">{row.depot}</span><span className="mt-1 block text-xs text-slate-500">{row.region} region</span></span>
                  <span className="text-sm font-semibold text-slate-700">{row.routeCount}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{row.vehicles.length}</span>
                </button>
              ))}
            </div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No depots match the current filters.</div>
          )}

          {activeTab === 'routes' && (
            routeRows.length ? <div className="space-y-3">
              {routeRows.map(row => (
                <section key={`${row.depot}-${row.route}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <header className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex items-center gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><RouteIcon className="h-4 w-4" /></span><div><h3 className="font-black text-slate-900">{row.route}</h3><p className="text-xs text-slate-500">{row.region} · Depot {row.depot}</p></div></div>
                    <span className="text-xs font-bold text-slate-600">{row.vehicles.length} assigned vehicle{row.vehicles.length === 1 ? '' : 's'}</span>
                  </header>
                  <div className="flex flex-wrap gap-2 p-4">{row.vehicles.map(vehicle => <span key={vehicle.vehicleNo} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Truck className="h-3.5 w-3.5 text-slate-400" />{vehicle.vehicleNo}</span>)}</div>
                </section>
              ))}
            </div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No routes or vehicle assignments match the current filters.</div>
          )}
        </div>
      )}

      <p className="text-xs text-slate-400">Note: route groups are derived from each vehicle’s assignedRoute/area field. This screen does not create a separate route record, so routes without assigned vehicles are not stored independently.</p>
    </div>
  );
};
