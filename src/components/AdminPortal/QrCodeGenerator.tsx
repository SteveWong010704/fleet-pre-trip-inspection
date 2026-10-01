import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Vehicle } from '../../types';
import { fetchVehicles } from '../../lib/api';
import {
  QrCode,
  Printer,
  Filter,
  CheckSquare,
  Square,
  Search,
  RefreshCw,
  Check,
  Truck,
  Globe,
  Save,
  Copy,
  AlertTriangle,
  Layers,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import QRCodeLib from 'qrcode';
import {
  getPublicBaseUrl,
  setPublicBaseUrl,
  buildVehicleDeepLink,
  isLocalOrPrivateHost,
  syncPublicBaseUrlFromServer,
} from '../../lib/publicUrl';

export const QrCodeGenerator: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  // Tab & Pagination State (load 30 per tab to prevent lag)
  const [currentTab, setCurrentTab] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(30);

  // Print Layout & Selection State
  const [selectedPlates, setSelectedPlates] = useState<Set<string>>(new Set());
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [printLayout, setPrintLayout] = useState<'standard' | 'compact' | 'large'>('standard');
  const [laminationGap, setLaminationGap] = useState<'4cm' | '2cm' | 'compact'>('4cm');
  const [showCutGuides, setShowCutGuides] = useState<boolean>(true);
  const [printScope, setPrintScope] = useState<'current_tab' | 'selected' | 'all_filtered'>('current_tab');
  const [isGeneratingPrintQrs, setIsGeneratingPrintQrs] = useState<boolean>(false);

  // Public domain override (e.g. ngrok or IIS public URL)
  const [publicUrlInput, setPublicUrlInput] = useState<string>(() => getPublicBaseUrl());
  const [isSavedUrl, setIsSavedUrl] = useState<boolean>(false);
  const [copiedPlate, setCopiedPlate] = useState<string | null>(null);

  // Sync with server settings on mount
  useEffect(() => {
    syncPublicBaseUrlFromServer().then((syncedUrl) => {
      if (syncedUrl) {
        setPublicUrlInput(syncedUrl);
      }
    });
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [selectedBranch, selectedStatus]);

  const loadVehicles = async () => {
    setLoading(true);
    try {
      const list = await fetchVehicles({
        branch: selectedBranch,
        status: selectedStatus,
      });
      setVehicles(list);
    } catch (err) {
      console.error('Failed to load fleet vehicles:', err);
    } finally {
      setLoading(false);
    }
  };

  // Derive unique filter options
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => {
      if (v.branch) set.add(v.branch);
    });
    return Array.from(set).sort();
  }, [vehicles]);

  const availableBrands = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => {
      if (v.brand) set.add(v.brand);
    });
    return Array.from(set).sort();
  }, [vehicles]);

  const availableTonnages = useMemo(() => {
    const set = new Set<number>();
    vehicles.forEach(v => {
      if (v.tonnage) set.add(v.tonnage);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [vehicles]);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const vCat = v.truckCategory || (v.model && v.model.toLowerCase().includes('feeder') ? 'Feeder' : 'Small Truck');
      if (selectedBranch !== 'ALL' && v.branch !== selectedBranch) return false;
      if (selectedStatus !== 'ALL' && v.currentStatus !== selectedStatus) return false;
      if (selectedBrand !== 'ALL' && v.brand !== selectedBrand) return false;
      if (selectedCategory !== 'ALL' && vCat !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const match =
          v.vehicleNo.toLowerCase().includes(q) ||
          (v.brand && v.brand.toLowerCase().includes(q)) ||
          (v.model && v.model.toLowerCase().includes(q)) ||
          (v.area && v.area.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [vehicles, selectedBranch, selectedStatus, selectedBrand, selectedCategory, search]);

  // Reset tab to 1 whenever filters change
  useEffect(() => {
    setCurrentTab(1);
  }, [selectedBranch, selectedStatus, selectedBrand, selectedCategory, search, pageSize]);

  // Pagination calculation
  const totalVehicles = filteredVehicles.length;
  const totalTabs = Math.max(1, Math.ceil(totalVehicles / pageSize));
  const safeCurrentTab = Math.min(currentTab, totalTabs);

  const startIndex = (safeCurrentTab - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalVehicles);

  const displayedVehicles = useMemo(() => {
    return filteredVehicles.slice(startIndex, endIndex);
  }, [filteredVehicles, startIndex, endIndex]);

  // On-demand QR Code Generation: Only generate QRs for the currently visible 30 vehicles!
  const generateQrsForSubset = async (list: Vehicle[], urlToUse?: string, forceRefresh = false) => {
    const baseToEncode = (urlToUse || publicUrlInput || getPublicBaseUrl()).trim();
    const missing = forceRefresh ? list : list.filter(v => !qrMap[v.vehicleNo]);
    if (missing.length === 0) return;

    const updates: Record<string, string> = {};
    await Promise.all(
      missing.map(async (v) => {
        try {
          const deepLink = buildVehicleDeepLink(v.vehicleNo, baseToEncode);
          updates[v.vehicleNo] = await QRCodeLib.toDataURL(deepLink, {
            width: 220,
            margin: 1,
            color: { dark: '#0F172A', light: '#FFFFFF' },
          });
        } catch (e) {
          console.error('Failed to generate QR for', v.vehicleNo, e);
        }
      })
    );
    setQrMap(prev => ({ ...prev, ...updates }));
  };

  // Generate QR codes for the displayed 30 vehicles on the active tab
  useEffect(() => {
    if (displayedVehicles.length > 0) {
      generateQrsForSubset(displayedVehicles, publicUrlInput);
    }
  }, [displayedVehicles, publicUrlInput]);

  // Save public URL
  const handleSavePublicUrl = async () => {
    const cleaned = await setPublicBaseUrl(publicUrlInput.trim());
    setIsSavedUrl(true);
    setTimeout(() => setIsSavedUrl(false), 3000);
    // Clear cache and regenerate for the current tab with new URL
    setQrMap({});
    if (displayedVehicles.length > 0) {
      await generateQrsForSubset(displayedVehicles, cleaned, true);
    }
  };

  const handleResetToOrigin = async () => {
    const origin = window.location.origin;
    setPublicUrlInput(origin);
    await setPublicBaseUrl(origin);
    setIsSavedUrl(true);
    setTimeout(() => setIsSavedUrl(false), 3000);
    setQrMap({});
    if (displayedVehicles.length > 0) {
      await generateQrsForSubset(displayedVehicles, origin, true);
    }
  };

  const handleCopyLink = (plate: string) => {
    const link = buildVehicleDeepLink(plate, publicUrlInput);
    navigator.clipboard.writeText(link);
    setCopiedPlate(plate);
    setTimeout(() => setCopiedPlate(null), 2500);
  };

  // Selection handlers
  const handleSelectCurrentTab = () => {
    const next = new Set(selectedPlates);
    displayedVehicles.forEach(v => next.add(v.vehicleNo));
    setSelectedPlates(next);
  };

  const handleDeselectCurrentTab = () => {
    const next = new Set(selectedPlates);
    displayedVehicles.forEach(v => next.delete(v.vehicleNo));
    setSelectedPlates(next);
  };

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedPlates);
    filteredVehicles.forEach(v => next.add(v.vehicleNo));
    setSelectedPlates(next);
  };

  const handleClearAllSelections = () => {
    setSelectedPlates(new Set());
  };

  const togglePlate = (plate: string) => {
    const next = new Set(selectedPlates);
    if (next.has(plate)) {
      next.delete(plate);
    } else {
      next.add(plate);
    }
    setSelectedPlates(next);
  };

  const isCurrentTabAllSelected =
    displayedVehicles.length > 0 &&
    displayedVehicles.every(v => selectedPlates.has(v.vehicleNo));

  // Printing handlers
  const handlePrint = async (scope: 'current_tab' | 'selected' | 'all_filtered') => {
    setPrintScope(scope);
    const targetVehicles =
      selectedPlates.size > 0
        ? filteredVehicles.filter(v => selectedPlates.has(v.vehicleNo))
        : scope === 'all_filtered'
        ? filteredVehicles
        : displayedVehicles;

    // Check if any QR in target is missing and pre-generate before opening print dialogue
    const missing = targetVehicles.filter(v => !qrMap[v.vehicleNo]);
    if (missing.length > 0) {
      setIsGeneratingPrintQrs(true);
      await generateQrsForSubset(targetVehicles, publicUrlInput);
      setIsGeneratingPrintQrs(false);
    }

    setTimeout(() => {
      window.print();
    }, 200);
  };

  // Vehicles to be rendered for printing
  const vehiclesToPrint = useMemo(() => {
    if (selectedPlates.size > 0) {
      return filteredVehicles.filter(v => selectedPlates.has(v.vehicleNo));
    }
    if (printScope === 'all_filtered') {
      return filteredVehicles;
    }
    return displayedVehicles;
  }, [selectedPlates, printScope, filteredVehicles, displayedVehicles]);

  const isLocalHost = isLocalOrPrivateHost();
  const currentActiveBaseUrl = getPublicBaseUrl();

  return (
    <div className="space-y-6">
      {/* Top Banner & Print Controls */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center font-bold shadow-sm shadow-blue-500/30 flex-shrink-0">
            <QrCode className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">QR Code Decal Generator</h1>
              <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Lag-Free Tab Loading ({pageSize}/tab)
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Print official pre-trip inspection decals for fleet windshields, fuel cards, and dashboards.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {/* Print Current Tab */}
          <button
            type="button"
            onClick={() => handlePrint('current_tab')}
            disabled={isGeneratingPrintQrs || displayedVehicles.length === 0}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-2 shadow-sm shadow-blue-500/30 transition cursor-pointer disabled:opacity-50"
            title={`Print decals on Tab ${safeCurrentTab} (${displayedVehicles.length} vehicles)`}
          >
            <Printer className="w-4 h-4" />
            <span>
              {isGeneratingPrintQrs
                ? 'Preparing Print...'
                : `Print Current Tab (${displayedVehicles.length})`}
            </span>
          </button>

          {/* Print Selected */}
          {selectedPlates.size > 0 && (
            <button
              type="button"
              onClick={() => handlePrint('selected')}
              disabled={isGeneratingPrintQrs}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-2 shadow-sm shadow-emerald-500/30 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Selected ({selectedPlates.size})</span>
            </button>
          )}

          {/* Print All Filtered */}
          <button
            type="button"
            onClick={() => handlePrint('all_filtered')}
            disabled={isGeneratingPrintQrs || filteredVehicles.length === 0}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-3.5 py-2.5 rounded-xl flex items-center space-x-1.5 transition cursor-pointer"
            title={`Print all ${filteredVehicles.length} vehicles across all tabs`}
          >
            <span>Print All ({filteredVehicles.length})</span>
          </button>
        </div>
      </div>

      {/* Network Configuration / Ngrok Domain Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4 no-print">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Public QR Scan URL Configuration (ngrok / IIS Public Endpoint)
              </h2>
              <p className="text-[11px] text-slate-500">
                Ensure driver phones scanning printed QR decals connect directly to your public link.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Active Target: <strong className="text-blue-600 font-bold">{currentActiveBaseUrl}</strong>
            </span>
          </div>
        </div>

        {/* Warning if running on localhost without public base URL */}
        {isLocalHost && currentActiveBaseUrl.includes('localhost') && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl flex items-start space-x-3 text-xs text-amber-900">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Notice: QR codes currently encode localhost address.</span>
              <p className="text-amber-800 text-[11px] leading-relaxed">
                If drivers scan these decals with mobile phones on outside 4G networks, the page will not load.
                Paste your active <strong>ngrok public URL</strong> (e.g. <code>https://your-domain.ngrok-free.app</code>) below and click <strong>Save & Apply</strong>.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={publicUrlInput}
              onChange={(e) => setPublicUrlInput(e.target.value)}
              placeholder="e.g. https://swift-fleet.ngrok-free.app"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={handleSavePublicUrl}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer flex-shrink-0"
          >
            {isSavedUrl ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
            <span>{isSavedUrl ? 'Applied to QRs!' : 'Save & Apply to QRs'}</span>
          </button>

          <button
            type="button"
            onClick={handleResetToOrigin}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2.5 rounded-xl transition cursor-pointer flex-shrink-0"
            title="Reset to current browser origin"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Branch Filter */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Depot / Branch
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            >
              <option value="ALL">All Regional Depots</option>
              {availableBranches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Inspection Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            >
              <option value="ALL">All Fleet Statuses</option>
              <option value="Ready">Ready for Dispatch 🟢</option>
              <option value="Pending Inspection">Pending Inspection 🟡</option>
              <option value="Grounded">Grounded / Defect 🔴</option>
            </select>
          </div>

          {/* Brand Filter */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Make / Brand
            </label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            >
              <option value="ALL">All Vehicle Brands</option>
              {availableBrands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Vehicle Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm font-semibold"
            >
              <option value="ALL">All Categories</option>
              <option value="Feeder">Feeder (Big Truck / APAD)</option>
              <option value="Small Truck">Small Truck (Local Delivery)</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="space-y-1 sm:col-span-2 md:col-span-4 lg:col-span-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Plate Search
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="e.g. VFH2715..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm font-mono"
              />
            </div>
          </div>
        </div>

        {/* Selection Bar & Layout Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Select Current Tab Button */}
            <button
              type="button"
              onClick={isCurrentTabAllSelected ? handleDeselectCurrentTab : handleSelectCurrentTab}
              className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 font-bold text-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              {isCurrentTabAllSelected ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>
                {isCurrentTabAllSelected
                  ? `Deselect Tab ${safeCurrentTab}`
                  : `Select Tab ${safeCurrentTab} (${displayedVehicles.length})`}
              </span>
            </button>

            {/* Select All Filtered Across All Tabs */}
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 font-semibold text-slate-700 transition cursor-pointer"
            >
              Select All Filtered ({filteredVehicles.length})
            </button>

            {selectedPlates.size > 0 && (
              <button
                type="button"
                onClick={handleClearAllSelections}
                className="px-3 py-1.5 rounded-xl text-rose-600 hover:bg-rose-50 font-semibold transition cursor-pointer"
              >
                Clear Selection ({selectedPlates.size})
              </button>
            )}

            <span className="text-slate-400 font-mono text-[11px] ml-1">
              Selected: <strong className="text-blue-600">{selectedPlates.size}</strong> of {totalVehicles}
            </span>
          </div>

          {/* Decal Print Size Layout Options */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setPrintLayout('standard')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                printLayout === 'standard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              Standard (4 / A4)
            </button>
            <button
              type="button"
              onClick={() => setPrintLayout('compact')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                printLayout === 'compact' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              Compact (6 / A4)
            </button>
            <button
              type="button"
              onClick={() => setPrintLayout('large')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                printLayout === 'large' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              Large (2 / A4)
            </button>
          </div>
        </div>

        {/* Lamination Margin & Anti-Peel Spacing Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <span>✂ 过塑安全裁切留边 (Lamination Spacing):</span>
            </span>
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setLaminationGap('4cm')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                  laminationGap === '4cm' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="卡片之间留出 4cm (40mm) 间隙，剪切后两边各留约 2cm 封胶边，过塑后绝不开胶脱层"
              >
                <span>⭐ 留 4cm (推荐过塑防开胶)</span>
              </button>
              <button
                type="button"
                onClick={() => setLaminationGap('2cm')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                  laminationGap === '2cm' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                留 2cm (常规)
              </button>
              <button
                type="button"
                onClick={() => setLaminationGap('compact')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                  laminationGap === 'compact' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                紧凑 (无留边)
              </button>
            </div>
          </div>

          <label className="flex items-center space-x-1.5 cursor-pointer font-semibold text-slate-700 text-xs">
            <input
              type="checkbox"
              checked={showCutGuides}
              onChange={(e) => setShowCutGuides(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
            />
            <span>打印虚线裁切指引 (Cut Lines ✂)</span>
          </label>
        </div>
      </div>

      {/* TAB NAVIGATION STRIP (Loads 30 at a time to prevent heavy DOM rendering) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm space-y-3 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span>Tabbed QR Batch Viewer</span>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono px-2 py-0.2 rounded-full">
                  Lightweight • Fast
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Displaying vehicles <strong>{totalVehicles === 0 ? 0 : startIndex + 1}–{endIndex}</strong> of <strong>{totalVehicles}</strong> (Tab {safeCurrentTab} of {totalTabs})
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 self-start sm:self-auto">
            {/* Page Size Selector */}
            <div className="flex items-center space-x-1 text-xs">
              <span className="text-slate-400 text-[11px]">Batch:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1 text-xs text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={30}>30 / tab (Fastest)</option>
                <option value={50}>50 / tab</option>
                <option value={100}>100 / tab</option>
              </select>
            </div>

            {/* Prev Tab */}
            <button
              type="button"
              disabled={safeCurrentTab <= 1}
              onClick={() => setCurrentTab(prev => Math.max(1, prev - 1))}
              className="p-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-1 text-xs font-semibold px-2.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Prev</span>
            </button>

            {/* Next Tab */}
            <button
              type="button"
              disabled={safeCurrentTab >= totalTabs}
              onClick={() => setCurrentTab(prev => Math.min(totalTabs, prev + 1))}
              className="p-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-1 text-xs font-semibold px-2.5"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Tab Pills */}
        {totalTabs > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-thin scrollbar-thumb-slate-200">
            {Array.from({ length: totalTabs }).map((_, idx) => {
              const tabNumber = idx + 1;
              const tabStart = (tabNumber - 1) * pageSize + 1;
              const tabEnd = Math.min(tabNumber * pageSize, totalVehicles);
              const isActive = safeCurrentTab === tabNumber;

              return (
                <button
                  key={tabNumber}
                  type="button"
                  onClick={() => setCurrentTab(tabNumber)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex-shrink-0 border ${
                    isActive
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/25'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  Tab {tabNumber} <span className="opacity-75 font-mono text-[10px]">({tabStart}–{tabEnd})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* QR Cards Display (Only loads the current tab's 30 vehicles on screen for lightning-fast rendering) */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center space-y-2 text-slate-400 no-print">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          <span className="text-xs font-medium">Loading Fleet Vehicles...</span>
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-2 no-print">
          <Truck className="w-8 h-8 mx-auto text-slate-400" />
          <div className="text-sm font-bold text-slate-800">No matching vehicles found</div>
          <p className="text-xs text-slate-400">Try adjusting the depot, tonnage, or plate search filters above.</p>
        </div>
      ) : (
        <>
          {/* SCREEN RENDERING (Renders only active tab: 30 items) */}
          <div
            className={`grid gap-4 no-print ${
              printLayout === 'compact'
                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                : printLayout === 'large'
                ? 'grid-cols-1 md:grid-cols-2'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {displayedVehicles.map((v) => {
              const isSelected = selectedPlates.has(v.vehicleNo);
              const qrSrc = qrMap[v.vehicleNo];
              const deepLink = buildVehicleDeepLink(v.vehicleNo, publicUrlInput);
              const isCopied = copiedPlate === v.vehicleNo;

              return (
                <div
                  key={v.vehicleNo}
                  onClick={() => togglePlate(v.vehicleNo)}
                  className={`bg-white text-slate-900 border-2 rounded-2xl p-4 shadow-sm flex flex-col justify-between cursor-pointer transition relative overflow-hidden ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/20 shadow-md ring-2 ring-blue-500/20'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  {/* Selection Checkbox Pill */}
                  <div className="absolute top-3 right-3">
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center transition border ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-slate-300 text-transparent hover:border-slate-400'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between space-x-4">
                    <div className="space-y-1 truncate flex-1">
                      <div className="text-[9px] uppercase font-bold tracking-widest text-slate-500 font-mono">
                        PRE-TRIP INSPECTION PASS
                      </div>
                      <div className="font-mono text-2xl font-black text-slate-950 tracking-wider">
                        {v.vehicleNo}
                      </div>
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {v.brand} • {v.model}
                      </div>
                      <div className="text-[10px] text-slate-600 font-mono">
                        Depot: <strong>{v.branch}</strong> ({v.area || 'Central'}) | {(v.truckCategory === 'Feeder' || String(v.model || '').toLowerCase().includes('feeder')) ? 'FEEDER' : 'SMALL TRUCK'}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono">
                        Card: {v.cardNo?.slice(-6) || 'N/A'} • PIN: {v.pinNo || '****'}
                      </div>
                    </div>

                    {/* QR Code Container */}
                    <div className="flex-shrink-0 flex flex-col items-center">
                      {qrSrc ? (
                        <img
                          src={qrSrc}
                          alt={`QR for ${v.vehicleNo}`}
                          className={`${
                            printLayout === 'large'
                              ? 'w-32 h-32'
                              : printLayout === 'compact'
                              ? 'w-20 h-20'
                              : 'w-24 h-24'
                          } p-1 border border-slate-200 rounded-lg shadow-2xs bg-white`}
                        />
                      ) : (
                        <div className="w-24 h-24 bg-slate-100 rounded-lg flex items-center justify-center text-xs text-slate-400">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        </div>
                      )}
                      <span className="text-[8px] font-mono font-bold text-slate-500 mt-1 uppercase">
                        SCAN FOR PRE-TRIP
                      </span>
                    </div>
                  </div>

                  {/* Bottom URL & Quick Copy Action */}
                  <div
                    className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-slate-400 truncate max-w-[210px]" title={deepLink}>
                      {deepLink}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleCopyLink(v.vehicleNo)}
                      className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded transition cursor-pointer"
                    >
                      {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{isCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* PRINT-ONLY RENDERING: Formatted for clean printing with 4cm lamination spacing */}
          <div
            className={`hidden print:grid ${
              printLayout === 'large' ? 'print:grid-cols-1' : 'print:grid-cols-2'
            }`}
            style={{
              rowGap: laminationGap === '4cm' ? '40mm' : laminationGap === '2cm' ? '20mm' : '10mm',
              columnGap: laminationGap === '4cm' ? '40mm' : laminationGap === '2cm' ? '20mm' : '10mm',
              padding: laminationGap === '4cm' ? '12mm 8mm' : '6mm',
            }}
          >
            {vehiclesToPrint.map((v) => {
              const qrSrc = qrMap[v.vehicleNo];
              return (
                <div
                  key={v.vehicleNo}
                  className="break-inside-avoid print:break-inside-avoid relative"
                  style={{
                    pageBreakInside: 'avoid',
                    breakInside: 'avoid',
                  }}
                >
                  {/* Visual cut guideline for lamination */}
                  {showCutGuides && laminationGap !== 'compact' && (
                    <div
                      className="absolute border border-dashed border-slate-400 rounded-2xl pointer-events-none"
                      style={{
                        top: laminationGap === '4cm' ? '-18mm' : '-8mm',
                        bottom: laminationGap === '4cm' ? '-18mm' : '-8mm',
                        left: laminationGap === '4cm' ? '-18mm' : '-8mm',
                        right: laminationGap === '4cm' ? '-18mm' : '-8mm',
                      }}
                    >
                      <span className="absolute -top-2.5 left-4 bg-white px-2 font-mono text-[8px] text-slate-500 uppercase tracking-widest font-bold">
                        ✂ 裁切虚线 CUT LINE ({laminationGap} LAMINATION SEAL)
                      </span>
                    </div>
                  )}

                  <div className="bg-white text-slate-900 border-2 border-slate-900 rounded-xl p-4 flex flex-col justify-between break-inside-avoid shadow-none relative z-10">
                    <div className="flex items-center justify-between space-x-4">
                      <div className="space-y-1 truncate flex-1">
                        <div className="text-[9px] uppercase font-bold tracking-widest text-slate-500 font-mono">
                          PRE-TRIP INSPECTION PASS
                        </div>
                        <div className="font-mono text-2xl font-black text-slate-950 tracking-wider">
                          {v.vehicleNo}
                        </div>
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {v.brand} • {v.model}
                        </div>
                        <div className="text-[10px] text-slate-600 font-mono">
                          Depot: <strong>{v.branch}</strong> ({v.area || 'Central'}) | {(v.truckCategory === 'Feeder' || String(v.model || '').toLowerCase().includes('feeder')) ? 'FEEDER' : 'SMALL TRUCK'}
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          Card: {v.cardNo?.slice(-6) || 'N/A'} • PIN: {v.pinNo || '****'}
                        </div>
                      </div>

                      <div className="flex-shrink-0 flex flex-col items-center">
                        {qrSrc ? (
                          <img
                            src={qrSrc}
                            alt={`QR for ${v.vehicleNo}`}
                            className={`${
                              printLayout === 'large'
                                ? 'w-32 h-32'
                                : 'w-24 h-24'
                            } p-1 border border-slate-900 rounded-lg bg-white`}
                          />
                        ) : (
                          <div className="w-24 h-24 border border-slate-900 rounded-lg flex items-center justify-center text-xs">
                            QR
                          </div>
                        )}
                        <span className="text-[8px] font-mono font-bold text-slate-700 mt-1 uppercase">
                          SCAN FOR PRE-TRIP
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Pagination Controls for convenience */}
          {totalTabs > 1 && (
            <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-xs text-slate-600 no-print">
              <span>
                Page <strong>{safeCurrentTab}</strong> of <strong>{totalTabs}</strong> ({totalVehicles} Total Fleet Vehicles)
              </span>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  disabled={safeCurrentTab <= 1}
                  onClick={() => {
                    setCurrentTab(prev => Math.max(1, prev - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-semibold cursor-pointer"
                >
                  Previous 30
                </button>
                <button
                  type="button"
                  disabled={safeCurrentTab >= totalTabs}
                  onClick={() => {
                    setCurrentTab(prev => Math.min(totalTabs, prev + 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-semibold cursor-pointer"
                >
                  Next 30
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
