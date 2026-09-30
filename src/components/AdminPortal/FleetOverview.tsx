import React, { useState, useEffect, useMemo } from 'react';
import { Vehicle, FleetStats } from '../../types';
import { fetchVehicles, fetchStats, updateVehicleStatus, updateVehicle, createVehicle, deleteVehicle } from '../../lib/api';
import { exportVehiclesToCsv } from '../../lib/csvParser';
import { buildVehicleDeepLink, getPublicBaseUrl } from '../../lib/publicUrl';
import {
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Download,
  Filter,
  QrCode,
  RefreshCw,
  Eye,
  ShieldCheck,
  X,
  Activity,
  SlidersHorizontal,
  Calendar,
  Layers,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Radio,
  Plus,
  Edit2,
  Trash2,
  Printer,
  Fuel,
  ExternalLink,
} from 'lucide-react';
import QRCodeLib from 'qrcode';

export const FleetOverview: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters for Real-time Completion Rate & Fleet
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState<string>('');

  // Real-Time Auto-Refresh Controls
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [refreshInterval, setRefreshInterval] = useState<number>(15); // in seconds
  const [countdown, setCountdown] = useState<number>(15);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Modals
  const [activeModalVehicle, setActiveModalVehicle] = useState<Vehicle | null>(null);
  const [modalQrUrl, setModalQrUrl] = useState<string>('');
  const [modalDeepLink, setModalDeepLink] = useState<string>('');

  // Edit / Create Vehicle Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create');
  const [vehicleForm, setVehicleForm] = useState<Partial<Vehicle>>({
    vehicleNo: '',
    brand: 'HINO',
    model: 'XZU600R-HKMLJ3',
    branch: 'BL',
    area: 'BL01',
    assignedRoute: 'BL01',
    truckCategory: 'Small Truck',
    currentStatus: 'Pending Inspection',
    cardNo: '',
    pinNo: '',
    litre: 24,
    limitRm: 107,
    costCenter: 'K11200',
    tyreSize: '195/75R15',
    batteryType: '95D31L',
    currentOdometer: 50000,
  });

  // Delete Vehicle State
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Auto-refresh timer loop
  useEffect(() => {
    loadData(false);
  }, [selectedBranch, selectedStatus, selectedCategory, selectedDate]);

  useEffect(() => {
    if (!autoRefresh) return;

    setCountdown(refreshInterval);
    const intervalTimer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadData(true);
          return refreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalTimer);
  }, [autoRefresh, refreshInterval, selectedBranch, selectedStatus, selectedCategory, selectedDate]);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);

    try {
      const [vList, sData] = await Promise.all([
        fetchVehicles({
          branch: selectedBranch,
          status: selectedStatus,
          truckCategory: selectedCategory,
        }),
        fetchStats({
          branch: selectedBranch,
          date: selectedDate,
          truckCategory: selectedCategory,
        }),
      ]);
      setVehicles(vList);
      setStats(sData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch real-time fleet data:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleManualRefresh = () => {
    loadData(false);
    setCountdown(refreshInterval);
  };

  const handleOpenVehicleModal = async (v: Vehicle) => {
    setActiveModalVehicle(v);
    try {
      const deepLink = buildVehicleDeepLink(v.vehicleNo);
      setModalDeepLink(deepLink);
      const url = await QRCodeLib.toDataURL(deepLink, { width: 260, margin: 1 });
      setModalQrUrl(url);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenCreateVehicle = () => {
    setEditMode('create');
    const randomPlate = `VFH${Math.floor(1000 + Math.random() * 9000)}`;
    setVehicleForm({
      vehicleNo: randomPlate,
      brand: 'HINO',
      model: 'XZU600R-HKMLJ3',
      branch: 'BL',
      area: 'BL01',
      assignedRoute: 'BL01',
      tonnage: 1,
      currentStatus: 'Pending Inspection',
      cardNo: `7002841-500092-${Math.floor(100000 + Math.random() * 900000)}`,
      pinNo: String(Math.floor(1000 + Math.random() * 9000)),
      litre: 24,
      limitRm: 107,
      costCenter: 'K11200',
      tyreSize: '195/75R15',
      batteryType: '95D31L',
      currentOdometer: 50000,
    });
    setMsg(null);
    setIsEditModalOpen(true);
  };

  const handleOpenEditVehicle = (v: Vehicle) => {
    setEditMode('edit');
    setVehicleForm({
      ...v,
      area: v.area || v.assignedRoute || `${v.branch || 'BL'}01`,
      assignedRoute: v.assignedRoute || v.area || `${v.branch || 'BL'}01`,
    });
    setMsg(null);
    setIsEditModalOpen(true);
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleForm.vehicleNo) {
      setMsg({ type: 'error', text: 'Vehicle plate number is required.' });
      return;
    }

    setIsProcessing(true);
    setMsg(null);
    try {
      const resolvedArea = (vehicleForm.area || vehicleForm.assignedRoute || `${vehicleForm.branch || 'BL'}01`).trim().toUpperCase();
      const payload = {
        ...vehicleForm,
        area: resolvedArea,
        assignedRoute: resolvedArea,
      };

      if (editMode === 'create') {
        const created = await createVehicle(payload);
        setMsg({ type: 'success', text: `Vehicle ${created.vehicleNo} added to fleet successfully!` });
      } else {
        const updated = await updateVehicle(vehicleForm.vehicleNo!, payload);
        setMsg({ type: 'success', text: `Vehicle ${updated.vehicleNo} updated successfully!` });
      }
      setIsEditModalOpen(false);
      loadData(false);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to save vehicle details.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteVehicleConfirm = async () => {
    if (!vehicleToDelete) return;
    setIsProcessing(true);
    try {
      await deleteVehicle(vehicleToDelete.vehicleNo);
      setVehicleToDelete(null);
      loadData(false);
      setMsg({ type: 'success', text: `Vehicle ${vehicleToDelete.vehicleNo} deleted.` });
    } catch (err: any) {
      alert(err.message || 'Failed to delete vehicle.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStatusChange = async (vehicleNo: string, newStatus: 'Ready' | 'Pending Inspection' | 'Grounded') => {
    try {
      const updated = await updateVehicleStatus(vehicleNo, { currentStatus: newStatus });
      setVehicles(prev => prev.map(v => v.vehicleNo === vehicleNo ? updated : v));
      if (activeModalVehicle?.vehicleNo === vehicleNo) {
        setActiveModalVehicle(updated);
      }
      loadData(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportCsv = () => {
    const csv = exportVehiclesToCsv(vehicles);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fleet_export_${selectedBranch}_${selectedDate}.csv`;
    link.click();
  };

  // Available Filter Options
  const depots = Array.from(new Set(vehicles.map(v => v.branch))).filter(Boolean).sort();
  
  // Window Pagination State
  const [pageSize, setPageSize] = useState<number>(15);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const vCat = v.truckCategory || (v.model && v.model.toLowerCase().includes('feeder') ? 'Feeder' : 'Small Truck');
      if (selectedCategory !== 'ALL' && vCat !== selectedCategory) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        v.vehicleNo.toLowerCase().includes(q) ||
        v.brand.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.cardNo && v.cardNo.toLowerCase().includes(q)) ||
        (v.area && v.area.toLowerCase().includes(q))
      );
    });
  }, [vehicles, selectedCategory, search]);

  const totalPages = Math.ceil(filteredVehicles.length / pageSize) || 1;
  const paginatedVehicles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredVehicles.slice(start, start + pageSize);
  }, [filteredVehicles, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedBranch, selectedStatus, selectedCategory]);

  const completionRate = stats?.completionRate ?? 0;

  return (
    <div className="space-y-6">
      {/* Real-time Telemetry & Auto-Refresh Header Bar */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center flex-shrink-0 shadow-inner">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold tracking-tight text-white">
                Live Pre-Trip Completion Engine
              </h2>
              <span className="text-[10px] uppercase font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                LIVE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Real-time synchronization with mobile inspection checkpoints across all regional depots.
            </p>
          </div>
        </div>

        {/* Action Buttons & Timer Controls */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <button
            onClick={handleOpenCreateVehicle}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm shadow-blue-500/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Vehicle</span>
          </button>

          {/* Auto Refresh Toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
              autoRefresh
                ? 'bg-blue-500/20 border-blue-400/40 text-blue-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${autoRefresh ? 'text-blue-400 animate-pulse' : 'text-slate-500'}`} />
            <span>Auto: {autoRefresh ? `${countdown}s` : 'Off'}</span>
          </button>

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {msg && (
        <div className={`p-4 rounded-xl text-xs font-bold border flex items-center justify-between ${
          msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Real-time KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total Fleet Size */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Fleet Total</span>
            <Truck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {stats?.totalFleet ?? stats?.totalFilteredVehicles ?? stats?.totalVehicles ?? vehicles.length}
          </div>
          <div className="text-[10px] text-slate-400">All registered commercial units</div>
        </div>

        {/* Ready to Dispatch */}
        <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-sm space-y-1 bg-emerald-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Ready / Passed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-700">{stats?.readyVehicles || 0}</div>
          <div className="text-[10px] text-emerald-600 font-medium">Cleared for route dispatch</div>
        </div>

        {/* Pending Inspection */}
        <div className="bg-white border border-amber-200/80 rounded-2xl p-4 shadow-sm space-y-1 bg-amber-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Pending Check</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-700">{stats?.pendingVehicles || 0}</div>
          <div className="text-[10px] text-amber-600 font-medium">Awaiting driver 10-pt check</div>
        </div>

        {/* Grounded / Defective */}
        <div className="bg-white border border-rose-200/80 rounded-2xl p-4 shadow-sm space-y-1 bg-rose-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Grounded</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-700">{stats?.groundedVehicles || 0}</div>
          <div className="text-[10px] text-rose-600 font-medium">Safety defects logged</div>
        </div>

        {/* Real-Time Completion Rate */}
        <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-blue-900 to-indigo-950 text-white rounded-2xl p-4 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-200">
            <span className="text-[11px] font-bold uppercase tracking-wider">Completion Rate</span>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <div className="my-1">
            <div className="text-3xl font-black font-mono text-white tracking-tight">{completionRate}%</div>
            <div className="w-full bg-blue-950/60 rounded-full h-1.5 mt-1.5 overflow-hidden border border-blue-800">
              <div
                className="bg-blue-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${completionRate}%` }}
              ></div>
            </div>
          </div>
          <div className="text-[10px] text-blue-300 font-mono">
            {stats?.inspectedCount ?? stats?.todayInspections ?? 0} / {stats?.totalFleet ?? stats?.totalFilteredVehicles ?? stats?.totalVehicles ?? vehicles.length} inspected today
          </div>
        </div>
      </div>

      {/* Interactive Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vehicle plate, brand, card no, area..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Branch / Depot Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 font-bold uppercase text-[10px]">Depot:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Depots</option>
              {depots.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 font-bold uppercase text-[10px]">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="Ready">Ready 🟢</option>
              <option value="Pending Inspection">Pending 🟡</option>
              <option value="Grounded">Grounded 🔴</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 font-bold uppercase text-[10px]">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="Feeder">Feeder (Big Truck / APAD)</option>
              <option value="Small Truck">Small Truck (Local Delivery)</option>
            </select>
          </div>

          {/* Export Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl text-xs transition flex items-center space-x-1.5 cursor-pointer border border-slate-200"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Fleet Catalog Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-2 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs">Loading real-time fleet state...</span>
          </div>
        ) : vehicles.length === 0 ? (
          <div className="py-16 px-4 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
              <Truck className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-800">Fleet Roster is Empty (Zero Presets)</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              No preset vehicles loaded into the database. Go to the "Bulk Upload & QR" tab to import your vehicle spreadsheet via CSV, or register one manually.
            </p>
            <div className="flex items-center justify-center space-x-2 pt-1">
              <button
                type="button"
                onClick={handleOpenCreateVehicle}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add First Vehicle</span>
              </button>
            </div>
          </div>
        ) : filteredVehicles.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs border border-dashed border-slate-200 m-4 rounded-xl">
            No vehicles match the selected filters.
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 shadow-xs">
                  <tr className="border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Vehicle Plate</th>
                    <th className="py-3 px-4">Make & Model</th>
                    <th className="py-3 px-4">Depot / Area</th>
                    <th className="py-3 px-4">Category & Specs</th>
                    <th className="py-3 px-4">Current Dispatch Status</th>
                    <th className="py-3 px-4">Fuel Card / PIN</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedVehicles.map((v) => (
                    <tr key={v.vehicleNo} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        <div className="flex items-center space-x-2">
                          <span className="text-blue-600 font-black">{v.vehicleNo}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{v.brand}</div>
                        <div className="text-[11px] text-slate-400">{v.model}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold text-[11px]">
                          {v.branch}
                        </span>
                        <span className="text-[11px] text-slate-500 ml-1.5">({v.area})</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        <div>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            (v.truckCategory === 'Feeder' || String(v.model || '').toLowerCase().includes('feeder'))
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-sky-50 text-sky-700 border border-sky-200'
                          }`}>
                            {(v.truckCategory === 'Feeder' || String(v.model || '').toLowerCase().includes('feeder')) ? 'Feeder (Big Truck)' : 'Small Truck'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{v.tyreSize || 'Standard Tyres'}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          value={v.currentStatus}
                          onChange={(e) => handleStatusChange(v.vehicleNo, e.target.value as any)}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border focus:outline-none cursor-pointer ${
                            v.currentStatus === 'Ready'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : v.currentStatus === 'Grounded'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          <option value="Ready">Ready 🟢</option>
                          <option value="Pending Inspection">Pending 🟡</option>
                          <option value="Grounded">Grounded 🔴</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                        <div>{v.cardNo?.slice(-6) || 'N/A'} • PIN {v.pinNo || '****'}</div>
                        <div className="text-[10px] text-slate-400">Limit: RM {v.limitRm || 107}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenVehicleModal(v)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="View QR Code"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditVehicle(v)}
                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="Edit Vehicle Details"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setVehicleToDelete(v)}
                            className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Delete Vehicle"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Footer Bar */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none"
                >
                  <option value={15}>15 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
                <span className="text-slate-400">|</span>
                <span>
                  Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(currentPage * pageSize, filteredVehicles.length)}</strong> of <strong>{filteredVehicles.length}</strong> vehicles
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-slate-100 transition cursor-pointer"
                >
                  Previous
                </button>
                <span className="px-2.5 py-1 text-xs font-mono font-bold text-slate-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-slate-100 transition cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Vehicle QR & Details Modal */}
      {activeModalVehicle && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 border border-slate-200 text-slate-800">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  Vehicle Inspection QR
                </span>
                <h3 className="text-2xl font-black font-mono text-slate-900">
                  {activeModalVehicle.vehicleNo}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalVehicle(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              {modalQrUrl ? (
                <img src={modalQrUrl} alt="QR Code" className="w-52 h-52 bg-white p-2 rounded-2xl shadow-sm border border-slate-200" />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-xs text-slate-400">
                  Loading QR...
                </div>
              )}
              <div className="text-center w-full space-y-1">
                <span className="text-[11px] text-slate-500 font-medium">Scan with driver phone to inspect</span>
                {modalDeepLink && (
                  <div className="text-[10px] font-mono text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded max-w-full truncate text-center select-all">
                    {modalDeepLink}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Brand / Model</span>
                <strong className="text-slate-800">{activeModalVehicle.brand} {activeModalVehicle.model}</strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Depot / Area</span>
                <strong className="text-slate-800">{activeModalVehicle.branch} ({activeModalVehicle.area})</strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Tonnage</span>
                <strong className="text-slate-800">{activeModalVehicle.tonnage} Ton</strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Current Status</span>
                <strong className={
                  activeModalVehicle.currentStatus === 'Ready'
                    ? 'text-emerald-600'
                    : activeModalVehicle.currentStatus === 'Grounded'
                    ? 'text-rose-600'
                    : 'text-amber-600'
                }>{activeModalVehicle.currentStatus}</strong>
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const target = activeModalVehicle;
                  setActiveModalVehicle(null);
                  handleOpenEditVehicle(target);
                }}
                className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center space-x-1.5 border border-blue-200"
              >
                <Edit2 className="w-4 h-4" />
                <span>Edit Vehicle</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveModalVehicle(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Vehicle Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editMode === 'create' ? 'Add New Fleet Vehicle' : `Edit Vehicle: ${vehicleForm.vehicleNo}`}
                  </h3>
                  <p className="text-xs text-slate-500">Manage vehicle registration, depot assignment and fuel specifications.</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Plate No */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Vehicle License Plate *
                  </label>
                  <input
                    type="text"
                    required
                    value={vehicleForm.vehicleNo || ''}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleNo: e.target.value.replace(/\s+/g, '').toUpperCase() })}
                    placeholder="e.g. VFH2715"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Make & Brand */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Manufacturer / Brand *
                  </label>
                  <input
                    type="text"
                    required
                    value={vehicleForm.brand || ''}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })}
                    placeholder="e.g. HINO, Daihatsu, Isuzu"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Model */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Model Description
                  </label>
                  <input
                    type="text"
                    value={vehicleForm.model || ''}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                    placeholder="e.g. XZU600R-HKMLJ3"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Branch / Depot */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Depot Branch Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={vehicleForm.branch || ''}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, branch: e.target.value.toUpperCase() })}
                    placeholder="e.g. KL, BL, KJ, GB"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Area / Route */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Assigned Route / Area (e.g. BL01, KL01)
                  </label>
                  <input
                    type="text"
                    value={vehicleForm.area || ''}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setVehicleForm({ ...vehicleForm, area: val, assignedRoute: val });
                    }}
                    placeholder="e.g. BL01, BL02, KL01"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Vehicle Category */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Vehicle Category *
                  </label>
                  <select
                    value={vehicleForm.truckCategory || 'Small Truck'}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, truckCategory: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Small Truck">Small Truck (Local Delivery Fleet)</option>
                    <option value="Feeder">Feeder (Big Truck / APAD Compliance)</option>
                  </select>
                </div>

                {/* Status */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Dispatch Status
                  </label>
                  <select
                    value={vehicleForm.currentStatus || 'Pending Inspection'}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, currentStatus: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Pending Inspection">Pending Inspection 🟡</option>
                    <option value="Ready">Ready for Dispatch 🟢</option>
                    <option value="Grounded">Grounded / Maintenance 🔴</option>
                  </select>
                </div>

                {/* Fuel Card No */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Fuel Card Number
                  </label>
                  <input
                    type="text"
                    value={vehicleForm.cardNo || ''}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, cardNo: e.target.value })}
                    placeholder="e.g. 7002841-500092-123456"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Fuel PIN */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Fuel Card PIN
                  </label>
                  <input
                    type="text"
                    value={vehicleForm.pinNo || ''}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, pinNo: e.target.value })}
                    placeholder="e.g. 1234"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Fuel Limit (RM) */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Fuel Limit (RM)
                  </label>
                  <input
                    type="number"
                    value={vehicleForm.limitRm || 107}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, limitRm: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Tyre Size */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Tyre Size Specification
                  </label>
                  <input
                    type="text"
                    value={vehicleForm.tyreSize || ''}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, tyreSize: e.target.value })}
                    placeholder="e.g. 195/75R15"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Battery Type */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Battery Model
                  </label>
                  <input
                    type="text"
                    value={vehicleForm.batteryType || ''}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, batteryType: e.target.value })}
                    placeholder="e.g. 95D31L"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-blue-500/25 transition cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Saving...' : editMode === 'create' ? 'Add Vehicle' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Vehicle Confirmation */}
      {vehicleToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-base text-slate-900">Delete Fleet Vehicle?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to remove <strong>{vehicleToDelete.vehicleNo}</strong> ({vehicleToDelete.brand} {vehicleToDelete.model}) from the fleet?
              </p>
            </div>
            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                onClick={() => setVehicleToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteVehicleConfirm}
                disabled={isProcessing}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-sm transition"
              >
                {isProcessing ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
