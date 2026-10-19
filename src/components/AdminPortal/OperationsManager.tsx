import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Route,
  Globe2,
  Plus,
  Edit2,
  Trash2,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Truck,
  Filter,
} from 'lucide-react';
import { RegionItem, DepotItem, RouteItem } from '../../types';
import {
  fetchRegions,
  createRegionApi,
  updateRegionApi,
  deleteRegionApi,
  fetchDepots,
  createDepotApi,
  updateDepotApi,
  deleteDepotApi,
  fetchRoutes,
  createRouteApi,
  updateRouteApi,
  deleteRouteApi,
  syncRoutesFromVehiclesApi,
} from '../../lib/api';

export const OperationsManager: React.FC = () => {
  const [subTab, setSubTab] = useState<'depots' | 'routes' | 'regions'>('depots');
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [depotFilter, setDepotFilter] = useState<string>('ALL');

  // Data
  const [regions, setRegions] = useState<RegionItem[]>([]);
  const [depots, setDepots] = useState<DepotItem[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);

  // Modals
  const [modalType, setModalType] = useState<'region' | 'depot' | 'route' | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [regs, deps, rts] = await Promise.all([
        fetchRegions(),
        fetchDepots(),
        fetchRoutes(),
      ]);
      setRegions(regs);
      setDepots(deps);
      setRoutes(rts);
    } catch (err: any) {
      console.error('Failed to load operations data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const showNotification = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  // Sync Routes from Vehicles
  const handleSyncRoutes = async () => {
    try {
      const res = await syncRoutesFromVehiclesApi();
      showNotification(`Synced routes from fleet vehicles: ${res.added} added. Total: ${res.total}`);
      await loadAllData();
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    }
  };

  // Open Modal Helpers
  const openCreateModal = (type: 'region' | 'depot' | 'route') => {
    setModalType(type);
    setEditingItem(null);
    setFormError(null);
    if (type === 'region') {
      setFormData({ id: '', description: '' });
    } else if (type === 'depot') {
      setFormData({ code: '', regionId: regions[0]?.id || 'CENTRAL', active: true });
    } else if (type === 'route') {
      setFormData({ code: '', depotId: depots[0]?.code || 'KL', active: true, assignedVehiclePlate: '' });
    }
  };

  const openEditModal = (type: 'region' | 'depot' | 'route', item: any) => {
    setModalType(type);
    setEditingItem(item);
    setFormError(null);
    setFormData({ ...item });
  };

  // Save Modal
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      if (modalType === 'region') {
        const code = (formData.id || '').trim().toUpperCase();
        if (!code) throw new Error('Region code is required');
        if (editingItem) {
          await updateRegionApi(editingItem.id, { name: code, description: formData.description });
          showNotification(`Region ${code} updated successfully`);
        } else {
          await createRegionApi({ id: code, name: code, description: formData.description });
          showNotification(`Region ${code} created successfully`);
        }
      } else if (modalType === 'depot') {
        const code = (formData.code || '').trim().toUpperCase();
        if (!code) throw new Error('Depot code is required');
        if (editingItem) {
          await updateDepotApi(editingItem.id || editingItem.code, {
            code,
            regionId: formData.regionId,
            active: formData.active !== false,
          });
          showNotification(`Depot ${code} updated successfully`);
        } else {
          await createDepotApi({
            code,
            regionId: formData.regionId,
            active: formData.active !== false,
          });
          showNotification(`Depot ${code} created successfully`);
        }
      } else if (modalType === 'route') {
        const code = (formData.code || '').trim().toUpperCase();
        if (!code) throw new Error('Route code is required');
        if (editingItem) {
          await updateRouteApi(editingItem.id || editingItem.code, {
            code,
            depotId: formData.depotId,
            assignedVehiclePlate: formData.assignedVehiclePlate,
            active: formData.active !== false,
          });
          showNotification(`Route ${code} updated successfully`);
        } else {
          await createRouteApi({
            code,
            depotId: formData.depotId,
            assignedVehiclePlate: formData.assignedVehiclePlate,
            active: formData.active !== false,
          });
          showNotification(`Route ${code} created successfully`);
        }
      }
      setModalType(null);
      await loadAllData();
    } catch (err: any) {
      setFormError(err.message || 'Operation failed');
    }
  };

  // Delete Handlers
  const handleDelete = async (type: 'region' | 'depot' | 'route', id: string) => {
    if (!window.confirm(`Are you sure you want to delete ${type.toUpperCase()} ${id}?`)) return;
    try {
      if (type === 'region') await deleteRegionApi(id);
      if (type === 'depot') await deleteDepotApi(id);
      if (type === 'route') await deleteRouteApi(id);
      showNotification(`${type.toUpperCase()} ${id} deleted`);
      await loadAllData();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  // Filtered views
  const q = search.trim().toLowerCase();

  const filteredDepots = depots.filter(d => {
    if (regionFilter !== 'ALL' && d.regionId !== regionFilter) return false;
    if (q && !d.code.toLowerCase().includes(q)) return false;
    return true;
  });

  const filteredRoutes = routes.filter(r => {
    if (depotFilter !== 'ALL' && r.depotId !== depotFilter) return false;
    if (regionFilter !== 'ALL') {
      const matchDepot = depots.find(d => d.code === r.depotId);
      if (matchDepot && matchDepot.regionId !== regionFilter) return false;
    }
    if (q && !r.code.toLowerCase().includes(q) && !(r.assignedVehiclePlate || '').toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  const filteredRegions = regions.filter(r => {
    if (q && !r.id.toLowerCase().includes(q) && !(r.description || '').toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. Header & Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Route className="w-5 h-5 text-blue-600" />
            <span>Operations Hierarchy: Regions, Depots & Routes</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Master directory for territorial regions, depot codes, and delivery/inspection route assignments.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSyncRoutes}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition cursor-pointer"
            title="Scan fleet vehicles and automatically create missing route codes"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Auto-Sync Routes from Fleet</span>
          </button>

          <button
            onClick={() => {
              if (subTab === 'regions') openCreateModal('region');
              else if (subTab === 'depots') openCreateModal('depot');
              else openCreateModal('route');
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-sm transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>
              {subTab === 'regions' ? 'Add Region' : subTab === 'depots' ? 'Add Depot' : 'Add Route'}
            </span>
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* 2. KPI Scorecard Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <Globe2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Regions</span>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 mt-1.5">
            {regions.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Northern, Central, East, South</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
            <span>Depots</span>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 mt-1.5">
            {depots.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Operational branch codes</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <Route className="w-3.5 h-3.5 text-amber-600" />
            <span>Routes</span>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 mt-1.5">
            {routes.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Active delivery route codes</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <Truck className="w-3.5 h-3.5 text-slate-600" />
            <span>Assigned Fleet</span>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 mt-1.5">
            {depots.reduce((acc, d) => acc + (d.vehiclesCount || 0), 0)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Vehicles linked to depots</div>
        </div>
      </div>

      {/* 3. Sub-Tabs & Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setSubTab('depots')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              subTab === 'depots' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Depots ({depots.length})</span>
          </button>

          <button
            onClick={() => setSubTab('routes')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              subTab === 'routes' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            <span>Routes ({routes.length})</span>
          </button>

          <button
            onClick={() => setSubTab('regions')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              subTab === 'regions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>Regions ({regions.length})</span>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center gap-3">
          {subTab !== 'regions' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Region:</span>
              <select
                value={regionFilter}
                onChange={e => setRegionFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">All Regions</option>
                {regions.map(r => (
                  <option key={r.id} value={r.id}>{r.id}</option>
                ))}
              </select>
            </div>
          )}

          {subTab === 'routes' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Depot:</span>
              <select
                value={depotFilter}
                onChange={e => setDepotFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">All Depots</option>
                {depots.map(d => (
                  <option key={d.code} value={d.code}>{d.code} ({d.regionId})</option>
                ))}
              </select>
            </div>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Search ${subTab}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-44 sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* 4. Tab Content Views */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">Loading operations hierarchy...</p>
        </div>
      ) : (
        <>
          {/* VIEW 1: DEPOTS TABLE */}
          {subTab === 'depots' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider font-mono">
                    <tr>
                      <th className="py-2.5 px-3">Depot Code</th>
                      <th className="py-2.5 px-3">Region</th>
                      <th className="py-2.5 px-3 text-right">Routes</th>
                      <th className="py-2.5 px-3 text-right">Vehicles</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDepots.map(depot => (
                      <tr key={depot.code} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-sm text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {depot.code}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-700">
                          <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[10px]">
                            {depot.regionId}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 font-medium">
                          {depot.routesCount || 0}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {depot.vehiclesCount || 0}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                            depot.active ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {depot.active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal('depot', depot)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                              title="Edit Depot"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete('depot', depot.code)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                              title="Delete Depot"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredDepots.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No depots found matching filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW 2: ROUTES TABLE */}
          {subTab === 'routes' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider font-mono">
                    <tr>
                      <th className="py-2.5 px-3">Route Code</th>
                      <th className="py-2.5 px-3">Depot</th>
                      <th className="py-2.5 px-3">Default Vehicle Plate</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRoutes.map(route => (
                      <tr key={route.code} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-sm text-slate-900 bg-amber-50 text-amber-900 px-2 py-0.5 rounded border border-amber-200">
                            {route.code}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                          {route.depotId}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-800">
                          {route.assignedVehiclePlate || <span className="text-slate-400 italic">Unassigned</span>}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                            route.active ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {route.active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal('route', route)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                              title="Edit Route"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete('route', route.code)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                              title="Delete Route"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredRoutes.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No routes found matching filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW 3: REGIONS TABLE */}
          {subTab === 'regions' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider font-mono">
                    <tr>
                      <th className="py-2.5 px-3">Region Code</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-right">Depots Count</th>
                      <th className="py-2.5 px-3 text-right">Vehicles Count</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRegions.map(reg => (
                      <tr key={reg.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-sm text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {reg.id}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-medium">
                          {reg.description || `${reg.id} Region`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 font-semibold">
                          {reg.depotsCount || 0}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {reg.vehiclesCount || 0}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal('region', reg)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                              title="Edit Region"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete('region', reg.id)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                              title="Delete Region"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: CREATE / EDIT */}
      {modalType && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-2xl p-6">
            <h2 className="text-base font-bold text-slate-900 uppercase font-mono">
              {editingItem ? `Edit ${modalType}` : `Create New ${modalType}`}
            </h2>

            {formError && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              {modalType === 'region' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Region Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. NORTHERN, CENTRAL"
                      value={formData.id || ''}
                      onChange={e => setFormData({ ...formData, id: e.target.value.toUpperCase() })}
                      disabled={!!editingItem}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Northern Region Hubs"
                      value={formData.description || ''}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {modalType === 'depot' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Depot Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. KJ, BL, KL"
                      value={formData.code || ''}
                      onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Region</label>
                    <select
                      value={formData.regionId || 'CENTRAL'}
                      onChange={e => setFormData({ ...formData, regionId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {regions.map(r => (
                        <option key={r.id} value={r.id}>{r.id}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="depotActiveCheck"
                      checked={formData.active !== false}
                      onChange={e => setFormData({ ...formData, active: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <label htmlFor="depotActiveCheck" className="text-xs text-slate-700 font-semibold cursor-pointer">
                      Depot Active for Vehicle Operations
                    </label>
                  </div>
                </>
              )}

              {modalType === 'route' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Route Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 7K01, BL01, LOG-B"
                      value={formData.code || ''}
                      onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Home Depot</label>
                    <select
                      value={formData.depotId || 'KL'}
                      onChange={e => setFormData({ ...formData, depotId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {depots.map(d => (
                        <option key={d.code} value={d.code}>{d.code} ({d.regionId})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Default Vehicle Plate (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. VBL2667"
                      value={formData.assignedVehiclePlate || ''}
                      onChange={e => setFormData({ ...formData, assignedVehiclePlate: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="routeActiveCheck"
                      checked={formData.active !== false}
                      onChange={e => setFormData({ ...formData, active: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <label htmlFor="routeActiveCheck" className="text-xs text-slate-700 font-semibold cursor-pointer">
                      Route Active
                    </label>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  {editingItem ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
