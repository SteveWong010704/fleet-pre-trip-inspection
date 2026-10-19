import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Layers3, MapPin, Plus, RefreshCw, Route as RouteIcon, Search, Pencil, Trash2, Truck, X, AlertTriangle, Save } from 'lucide-react';
import { fetchVehicles, fetchOrgStructure, saveOrgStructure, OrgStructure } from '../../lib/api';
import { Vehicle } from '../../types';

type Tab = 'regions' | 'depots' | 'routes';
type FormKind = 'region' | 'depot' | 'route';
type FormState = { id?: string; name: string; code: string; parentId: string };
const emptyStructure: OrgStructure = { regions: [], depots: [], routes: [] };
const norm = (v?: string) => String(v || '').trim().toUpperCase();
const id = (kind: string) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const getDepotCode = (v: Vehicle) => norm(v.branch);
const getRouteCode = (v: Vehicle) => norm(v.assignedRoute || v.area);

export const RouteDepotManagement: React.FC = () => {
  const [structure, setStructure] = useState<OrgStructure>(emptyStructure);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('regions');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [depotFilter, setDepotFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formKind, setFormKind] = useState<FormKind | null>(null);
  const [form, setForm] = useState<FormState>({ name: '', code: '', parentId: '' });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [s, v] = await Promise.all([fetchOrgStructure(), fetchVehicles()]);
      setStructure(s || emptyStructure); setVehicles(v || []);
    } catch (e: any) { setError(e?.message || 'Could not load master data and fleet assignments.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const vehicleDepotCodes = useMemo(() => Array.from(new Set(vehicles.map(getDepotCode).filter(Boolean))).sort(), [vehicles]);
  const registeredCodes = useMemo(() => new Set(structure.depots.map(d => norm(d.code))), [structure.depots]);
  const unregisteredDepotCodes = vehicleDepotCodes.filter(code => !registeredCodes.has(code));
  const routeAssignments = useMemo(() => {
    const map = new Map<string, Vehicle[]>();
    vehicles.forEach(v => {
      const depot = getDepotCode(v) || 'NO DEPOT';
      const route = getRouteCode(v) || 'NO ROUTE';
      const key = `${depot}::${route}`;
      map.set(key, [...(map.get(key) || []), v]);
    });
    return map;
  }, [vehicles]);

  const visibleRegions = structure.regions.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));
  const visibleDepots = structure.depots.filter(d =>
    (regionFilter === 'ALL' || d.regionId === regionFilter) &&
    (!search || [d.code, d.name, structure.regions.find(r => r.id === d.regionId)?.name || ''].some(s => s.toLowerCase().includes(search.toLowerCase())))
  );
  const visibleRoutes = structure.routes.filter(r => {
    const depot = structure.depots.find(d => d.id === r.depotId);
    return (regionFilter === 'ALL' || depot?.regionId === regionFilter) &&
      (depotFilter === 'ALL' || r.depotId === depotFilter) &&
      (!search || [r.code, r.name, depot?.code || '', depot?.name || ''].some(s => s.toLowerCase().includes(search.toLowerCase())));
  });

  const openCreate = (kind: FormKind, parentId = '') => {
    setError(''); setNotice(''); setFormKind(kind);
    setForm({ name: '', code: '', parentId, id: undefined });
  };
  const openEdit = (kind: FormKind, item: any) => {
    setError(''); setNotice(''); setFormKind(kind);
    setForm({
      id: item.id, name: item.name || '', code: item.code || '',
      parentId: kind === 'depot' ? item.regionId : kind === 'route' ? item.depotId : ''
    });
  };

  const persist = async (next: OrgStructure, success: string) => {
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = await saveOrgStructure(next);
      setStructure(saved); setNotice(success); setFormKind(null);
    } catch (e: any) { setError(e?.message || 'Unable to save changes.'); }
    finally { setSaving(false); }
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    let next: OrgStructure = {
      regions: [...structure.regions], depots: [...structure.depots], routes: [...structure.routes]
    };
    const entityId = form.id || id(formKind || 'item');
    if (formKind === 'region') {
      const name = form.name.trim();
      if (next.regions.some(r => r.id !== form.id && r.name.toLowerCase() === name.toLowerCase())) { setError('A region with this name already exists.'); return; }
      const item = { id: entityId, name };
      next.regions = form.id ? next.regions.map(r => r.id === form.id ? item : r) : [...next.regions, item];
    } else if (formKind === 'depot') {
      const code = form.code.trim().toUpperCase();
      if (!code) { setError('Depot code is required.'); return; }
      if (!form.parentId || !next.regions.some(r => r.id === form.parentId)) { setError('Select a valid region.'); return; }
      if (next.depots.some(d => d.id !== form.id && d.code.toUpperCase() === code)) { setError('Depot code already exists.'); return; }
      const oldDepot = form.id ? next.depots.find(d => d.id === form.id) : undefined;
      if (oldDepot && oldDepot.code.toUpperCase() !== code && vehicles.some(v => getDepotCode(v) === oldDepot.code.toUpperCase())) {
        setError('This depot code is used by existing vehicle records. Keep the code unchanged; you may edit the depot name or region. Reassign vehicles first before changing the code.');
        return;
      }
      const item = { id: entityId, code, name: form.name.trim(), regionId: form.parentId };
      next.depots = form.id ? next.depots.map(d => d.id === form.id ? item : d) : [...next.depots, item];
    } else if (formKind === 'route') {
      const code = form.code.trim().toUpperCase();
      if (!code) { setError('Route code is required.'); return; }
      if (!form.parentId || !next.depots.some(d => d.id === form.parentId)) { setError('Select a valid depot.'); return; }
      if (next.routes.some(r => r.id !== form.id && r.code.toUpperCase() === code)) { setError('Route code already exists.'); return; }
      const oldRoute = form.id ? next.routes.find(r => r.id === form.id) : undefined;
      if (oldRoute) {
        const assigned = vehicles.filter(v => getRouteCode(v) === oldRoute.code.toUpperCase());
        if (assigned.length && (oldRoute.code.toUpperCase() !== code || oldRoute.depotId !== form.parentId)) {
          setError('This route is used by existing vehicle records. Keep its code and depot unchanged; you may edit the route name. Reassign vehicles first before changing its code or depot.');
          return;
        }
      }
      const item = { id: entityId, code, name: form.name.trim(), depotId: form.parentId };
      next.routes = form.id ? next.routes.map(r => r.id === form.id ? item : r) : [...next.routes, item];
    }
    await persist(next, `${formKind === 'region' ? 'Region' : formKind === 'depot' ? 'Depot' : 'Route'} saved successfully.`);
  };

  const remove = async (kind: FormKind, item: any) => {
    const next: OrgStructure = { regions: [...structure.regions], depots: [...structure.depots], routes: [...structure.routes] };
    if (kind === 'region') {
      const linked = next.depots.filter(d => d.regionId === item.id);
      if (linked.length) { setError(`Cannot delete ${item.name}: ${linked.length} depot(s) still belong to this region. Move or delete those depots first.`); return; }
      next.regions = next.regions.filter(r => r.id !== item.id);
    } else if (kind === 'depot') {
      const linkedRoutes = next.routes.filter(r => r.depotId === item.id);
      const assignedVehicles = vehicles.filter(v => getDepotCode(v) === norm(item.code));
      if (linkedRoutes.length || assignedVehicles.length) { setError(`Cannot delete depot ${item.code}: it has ${linkedRoutes.length} route(s) and ${assignedVehicles.length} vehicle assignment(s). Reassign them first.`); return; }
      next.depots = next.depots.filter(d => d.id !== item.id);
    } else {
      const assigned = vehicles.filter(v => getRouteCode(v) === norm(item.code));
      if (assigned.length) { setError(`Cannot delete route ${item.code}: ${assigned.length} vehicle(s) still use this route code. Reassign them first.`); return; }
      next.routes = next.routes.filter(r => r.id !== item.id);
    }
    if (!window.confirm(`Delete ${kind} "${item.name || item.code}"?`)) return;
    await persist(next, `${kind[0].toUpperCase() + kind.slice(1)} deleted.`);
  };

  const registerExistingDepot = (code: string) => {
    setActiveTab('depots'); setRegionFilter('ALL');
    setFormKind('depot'); setForm({ id: undefined, name: code, code, parentId: structure.regions[0]?.id || '' });
    setError(''); setNotice('');
    if (!structure.regions.length) setError('Create a region first, then register this existing depot under it.');
  };

  const tabs: { id: Tab; label: string; count: number; icon: React.ReactNode }[] = [
    { id: 'regions', label: 'Regions', count: structure.regions.length, icon: <Layers3 className="h-4 w-4" /> },
    { id: 'depots', label: 'Depots', count: structure.depots.length, icon: <Building2 className="h-4 w-4" /> },
    { id: 'routes', label: 'Routes', count: structure.routes.length, icon: <RouteIcon className="h-4 w-4" /> },
  ];

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Fleet structure</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Region, Depot & Route Management</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Manage master records separately. Depot codes are matched against vehicle branch codes; route codes are matched against each vehicle's assigned route/area.</p>
      </div>
      <button onClick={() => void load()} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[{label:'Regions',value:structure.regions.length},{label:'Registered depots',value:structure.depots.length},{label:'Vehicles',value:vehicles.length}].map(k => <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">{k.label}</p><p className="mt-1 text-2xl font-black text-slate-900">{k.value}</p></div>)}
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"><div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {tabs.map(t => <button key={t.id} onClick={() => { setActiveTab(t.id); setError(''); }} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left ${activeTab === t.id ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${activeTab === t.id ? 'bg-white/15' : 'bg-slate-100 text-slate-600'}`}>{t.icon}</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{t.label}</span><span className="block text-xs opacity-75">Create, edit and delete</span></span><span className="rounded-full bg-black/5 px-2 py-1 text-xs font-bold">{t.count}</span>
      </button>)}
    </div></div>

    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
      <label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${activeTab}…`} className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
      {activeTab !== 'regions' && <select value={regionFilter} onChange={e => { setRegionFilter(e.target.value); setDepotFilter('ALL'); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="ALL">All regions</option>{structure.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
      {activeTab === 'routes' && <select value={depotFilter} onChange={e => setDepotFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="ALL">All depots</option>{structure.depots.filter(d => regionFilter === 'ALL' || d.regionId === regionFilter).map(d => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}</select>}
      <button onClick={() => openCreate(activeTab === 'regions' ? 'region' : activeTab === 'depots' ? 'depot' : 'route', activeTab === 'depots' ? structure.regions[0]?.id || '' : activeTab === 'routes' ? structure.depots[0]?.id || '' : '')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"><Plus className="h-4 w-4" />Add {activeTab === 'regions' ? 'region' : activeTab === 'depots' ? 'depot' : 'route'}</button>
    </div>

    {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

    {unregisteredDepotCodes.length > 0 && activeTab === 'depots' && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-bold text-amber-900">Vehicle depots not mapped yet ({unregisteredDepotCodes.length})</h3><p className="mt-1 text-xs text-amber-800">These codes exist in real vehicle records but do not have a Region/Depot master record. Register each one to fix the mismatch.</p>
      <div className="mt-3 flex flex-wrap gap-2">{unregisteredDepotCodes.map(code => <button key={code} onClick={() => registerExistingDepot(code)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100">+ Register {code}</button>)}</div>
    </div>}

    {loading ? <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Loading saved master records…</div> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {activeTab === 'regions' && <>{visibleRegions.map(r => <div key={r.id} className="flex items-center gap-3 border-b border-slate-100 p-4 last:border-0"><MapPin className="h-5 w-5 text-blue-600" /><div className="min-w-0 flex-1"><p className="font-bold text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{structure.depots.filter(d => d.regionId === r.id).length} depots</p></div><button onClick={() => openEdit('region', r)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit region"><Pencil className="h-4 w-4" /></button><button onClick={() => void remove('region', r)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="Delete region"><Trash2 className="h-4 w-4" /></button></div>)}{!visibleRegions.length && <p className="p-8 text-center text-sm text-slate-500">No regions yet. Add a region to begin.</p>}</>}
      {activeTab === 'depots' && <>{visibleDepots.map(d => <div key={d.id} className="flex items-center gap-3 border-b border-slate-100 p-4 last:border-0"><Building2 className="h-5 w-5 text-blue-600" /><div className="min-w-0 flex-1"><p className="font-bold text-slate-900">{d.code} · {d.name}</p><p className="text-xs text-slate-500">{structure.regions.find(r => r.id === d.regionId)?.name || 'Invalid region mapping'} · {vehicles.filter(v => getDepotCode(v) === norm(d.code)).length} vehicle(s)</p></div><button onClick={() => openEdit('depot', d)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit depot"><Pencil className="h-4 w-4" /></button><button onClick={() => void remove('depot', d)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="Delete depot"><Trash2 className="h-4 w-4" /></button></div>)}{!visibleDepots.length && <p className="p-8 text-center text-sm text-slate-500">No depots match this filter.</p>}</>}
      {activeTab === 'routes' && <>{visibleRoutes.map(r => { const d = structure.depots.find(x => x.id === r.depotId); const assigned = vehicles.filter(v => getRouteCode(v) === norm(r.code) && (!d || getDepotCode(v) === norm(d.code))); return <div key={r.id} className="flex items-center gap-3 border-b border-slate-100 p-4 last:border-0"><RouteIcon className="h-5 w-5 text-blue-600" /><div className="min-w-0 flex-1"><p className="font-bold text-slate-900">{r.code} · {r.name}</p><p className="text-xs text-slate-500">Depot {d?.code || 'Unknown'} · {assigned.length} matching vehicle(s)</p>{assigned.length > 0 && <p className="mt-1 text-xs text-slate-500">{assigned.map(v => v.vehicleNo).join(', ')}</p>}</div><button onClick={() => openEdit('route', r)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit route"><Pencil className="h-4 w-4" /></button><button onClick={() => void remove('route', r)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="Delete route"><Trash2 className="h-4 w-4" /></button></div>})}{!visibleRoutes.length && <p className="p-8 text-center text-sm text-slate-500">No routes match this filter.</p>}
        <div className="border-t border-slate-100 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-700">Existing vehicle route values (legacy assignments)</p><div className="mt-2 flex flex-wrap gap-2">{Array.from(routeAssignments.entries()).map(([key, assigned]) => <span key={key} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600">{key.replace('::', ' / ')} · {assigned.length} vehicle(s)</span>)}</div></div>
      </>}
    </div>}

    {formKind && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true"><form onSubmit={submitForm} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl sm:p-6">
      <div className="flex items-center justify-between"><div><h3 className="text-lg font-black text-slate-900">{form.id ? 'Edit' : 'Add'} {formKind}</h3><p className="text-xs text-slate-500">Changes are saved to the server's organization settings.</p></div><button type="button" onClick={() => setFormKind(null)} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
      <label className="block space-y-1"><span className="text-xs font-bold text-slate-600">{formKind === 'region' ? 'Region name' : 'Name'}</span><input autoFocus required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" placeholder={formKind === 'region' ? 'e.g. CENTRAL' : formKind === 'depot' ? 'e.g. Balakong Depot' : 'e.g. Balakong Route 01'} /></label>
      {formKind !== 'region' && <label className="block space-y-1"><span className="text-xs font-bold text-slate-600">{formKind === 'depot' ? 'Depot code (must match vehicle branch)' : 'Route code (must match assigned route/area)'}</span><input required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" placeholder={formKind === 'depot' ? 'e.g. BL' : 'e.g. BL01'} /></label>}
      {formKind === 'depot' && <label className="block space-y-1"><span className="text-xs font-bold text-slate-600">Region</span><select required value={form.parentId} onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Select region</option>{structure.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
      {formKind === 'route' && <label className="block space-y-1"><span className="text-xs font-bold text-slate-600">Depot</span><select required value={form.parentId} onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Select depot</option>{structure.depots.map(d => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}</select></label>}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setFormKind(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancel</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save changes'}</button></div>
    </form></div>}
  </div>;
};
