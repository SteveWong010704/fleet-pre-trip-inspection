import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Award,
  AlertTriangle,
  FileSpreadsheet,
  FileDown,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Truck,
  Building2,
  ShieldCheck,
  Calendar,
  Filter,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Info,
  Trash2,
  Search,
  X,
} from 'lucide-react';
import { ExecutiveAnalyticsData, DailyTrendPoint, DepotRankingItem, DefectHotspotItem, DailyDepotMetric } from '../../types';
import { fetchExecutiveAnalytics, seedDemoInspections, fetchDepots, purgeDemoDataApi, fetchDemoStatus } from '../../lib/api';
import { exportExecutiveSummaryToExcel, exportExecutiveSummaryToPdf } from '../../lib/executiveExport';

export const ExecutiveDashboard: React.FC = () => {
  const [data, setData] = useState<ExecutiveAnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [masterDepots, setMasterDepots] = useState<string[]>([]);

  // Filter States
  const [timeframe, setTimeframe] = useState<'7d' | '14d' | '30d' | 'all'>('30d');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  
  // Chart Hover & Active Day State
  const [activeHoverPoint, setActiveHoverPoint] = useState<DailyTrendPoint | null>(null);
  const [chartViewMode, setChartViewMode] = useState<'both' | 'rate' | 'volume'>('both');

  // Hotspot expanded detail
  const [expandedHotspotId, setExpandedHotspotId] = useState<string | null>(null);

  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [seedSuccessNotice, setSeedSuccessNotice] = useState<string | null>(null);

  // Daily per depot table filter state
  const [dailyDepotFilter, setDailyDepotFilter] = useState<string>('ALL');
  const [dailyDateFilter, setDailyDateFilter] = useState<string>('ALL');
  const [dailySearch, setDailySearch] = useState<string>('');
  const [dailyPage, setDailyPage] = useState<number>(1);
  const [demoStatus, setDemoStatus] = useState<{
    isDemoActive: boolean;
    demoPurged: boolean;
    totalVehicles: number;
    totalDrivers: number;
    totalInspections: number;
  } | null>(null);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, dStatus] = await Promise.all([
        fetchExecutiveAnalytics({
          timeframe,
          branch: selectedBranch,
          truckCategory: selectedCategory,
        }),
        fetchDemoStatus().catch(() => null),
      ]);
      setData(res);
      if (dStatus) setDemoStatus(dStatus);
    } catch (err: any) {
      console.error('Failed to load executive analytics:', err);
      setError(err.message || 'Unable to load analytics data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepots()
      .then(deps => {
        if (deps && deps.length > 0) {
          setMasterDepots(deps.map(d => d.code));
        }
      })
      .catch(() => {});
  }, []);

  const availableDepots = useMemo(() => {
    const set = new Set<string>(masterDepots);
    if (data?.depotRankings) {
      data.depotRankings.forEach(r => set.add(r.depot));
    }
    return Array.from(set).filter(Boolean).sort();
  }, [masterDepots, data]);

  useEffect(() => {
    loadAnalytics();
  }, [timeframe, selectedBranch, selectedCategory]);

  useEffect(() => {
    setDailyPage(1);
  }, [dailyDepotFilter, dailyDateFilter, dailySearch]);

  const handleSeedDemo = async () => {
    if (!window.confirm('Generate 30 days of realistic historical pre-trip inspection records for analytics demo?')) return;
    try {
      setIsSeeding(true);
      const res = await seedDemoInspections(30);
      setSeedSuccessNotice(res.message || 'Successfully seeded 30-day historical audit data!');
      await loadAnalytics();
      setTimeout(() => setSeedSuccessNotice(null), 5000);
    } catch (err: any) {
      alert(`Seeding failed: ${err.message}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const handlePurgeDemo = async () => {
    if (!window.confirm('Are you sure you want to purge all demo seed data? This will clear demo vehicles, drivers, and mock inspections so the system runs strictly on your real database.')) return;
    try {
      setIsPurging(true);
      const res = await purgeDemoDataApi();
      setSeedSuccessNotice(res.message || 'Demo data successfully purged. Ready for real database records.');
      await loadAnalytics();
      setTimeout(() => setSeedSuccessNotice(null), 6000);
    } catch (err: any) {
      alert(`Purge failed: ${err.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  const handleExportExcel = () => {
    if (!data) return;
    exportExecutiveSummaryToExcel(data);
  };

  const handleExportPdf = () => {
    if (!data) return;
    exportExecutiveSummaryToPdf(data);
  };

  const filteredDailyMetrics = useMemo(() => {
    if (!data?.dailyDepotMetrics) return [];
    return data.dailyDepotMetrics.filter(m => {
      if (dailyDepotFilter !== 'ALL' && m.depot !== dailyDepotFilter) return false;
      if (dailyDateFilter !== 'ALL' && m.date !== dailyDateFilter) return false;
      if (dailySearch) {
        const q = dailySearch.toLowerCase();
        return m.depot.toLowerCase().includes(q) || m.formattedDate.toLowerCase().includes(q);
      }
      return true;
    });
  }, [data?.dailyDepotMetrics, dailyDepotFilter, dailyDateFilter, dailySearch]);

  const uniqueDailyDates = useMemo(() => {
    if (!data?.dailyDepotMetrics) return [];
    return Array.from(new Set(data.dailyDepotMetrics.map(m => m.date))).sort((a, b) => b.localeCompare(a));
  }, [data?.dailyDepotMetrics]);

  const { minDailyDate, maxDailyDate } = useMemo(() => {
    if (!data?.dailyDepotMetrics || data.dailyDepotMetrics.length === 0) return { minDailyDate: undefined, maxDailyDate: undefined };
    const dates = data.dailyDepotMetrics.map(m => m.date).filter(Boolean).sort();
    return { minDailyDate: dates[0], maxDailyDate: dates[dates.length - 1] };
  }, [data?.dailyDepotMetrics]);

  const selectedDaySummary = useMemo(() => {
    if (!data?.dailyDepotMetrics || dailyDateFilter === 'ALL') return null;
    const dayRows = data.dailyDepotMetrics.filter(m => m.date === dailyDateFilter);
    if (dayRows.length === 0) return null;

    const totalRoutes = dayRows.reduce((acc, r) => acc + (r.totalRoutes || 0), 0);
    const completedRoutes = dayRows.reduce((acc, r) => acc + (r.completedRoutes || 0), 0);
    const totalInspections = dayRows.reduce((acc, r) => acc + (r.totalInspections || 0), 0);
    const passedCount = dayRows.reduce((acc, r) => acc + (r.passedCount || 0), 0);
    const defectCount = dayRows.reduce((acc, r) => acc + (r.defectCount || 0), 0);
    const groundedVehicles = dayRows.reduce((acc, r) => acc + (r.groundedVehicles || 0), 0);
    const complianceRate = totalRoutes > 0 ? Number(((completedRoutes / totalRoutes) * 100).toFixed(1)) : 0;
    const defectRate = totalInspections > 0 ? Number(((defectCount / totalInspections) * 100).toFixed(1)) : 0;
    const avgScore = Number((dayRows.reduce((acc, r) => acc + (r.score || 0), 0) / dayRows.length).toFixed(1));

    return {
      date: dailyDateFilter,
      formattedDate: dayRows[0]?.formattedDate || dailyDateFilter,
      depotsCount: dayRows.length,
      totalRoutes,
      completedRoutes,
      complianceRate,
      totalInspections,
      passedCount,
      defectCount,
      groundedVehicles,
      defectRate,
      avgScore,
    };
  }, [data?.dailyDepotMetrics, dailyDateFilter]);

  const dailyPageSize = 10;
  const totalDailyPages = Math.max(1, Math.ceil(filteredDailyMetrics.length / dailyPageSize));
  const paginatedDailyMetrics = useMemo(() => {
    const start = (dailyPage - 1) * dailyPageSize;
    return filteredDailyMetrics.slice(start, start + dailyPageSize);
  }, [filteredDailyMetrics, dailyPage, dailyPageSize]);

  // SVG Chart Dimensions & Math
  const chartTrends = data?.dailyTrends || [];
  const maxInspected = useMemo(() => {
    if (chartTrends.length === 0) return 25;
    return Math.max(...chartTrends.map(t => t.inspected), 20);
  }, [chartTrends]);

  const svgWidth = 840;
  const svgHeight = 240;
  const paddingLeft = 46;
  const paddingRight = 24;
  const paddingTop = 24;
  const paddingBottom = 40;
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Executive Compliance & Fleet Analytics
            </h1>
            <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              APAD Act 715
            </span>
            {demoStatus?.isDemoActive ? (
              <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                Demo Seed Data Active ({demoStatus.totalInspections} Audits)
              </span>
            ) : demoStatus?.demoPurged ? (
              <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Real DB Mode (Clean)
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Statutory pre-trip roadworthiness compliance, depot leaderboard rankings, and recurring component defect diagnostics.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={handleExportPdf}
            disabled={!data || loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition cursor-pointer"
            title="Download formatted executive audit summary PDF for management and regulatory review"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Export Executive PDF</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={!data || loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition cursor-pointer"
            title="Download complete multi-sheet Excel spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Excel (.xlsx)</span>
          </button>

          <button
            onClick={handleSeedDemo}
            disabled={isSeeding || loading || isPurging}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition cursor-pointer"
            title="Populate demo 30-day historical inspections if database is new"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSeeding ? 'animate-spin' : ''}`} />
            <span>{isSeeding ? 'Generating...' : 'Seed Audit Data'}</span>
          </button>

          <button
            onClick={handlePurgeDemo}
            disabled={isPurging || loading || isSeeding}
            className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl shadow-sm transition cursor-pointer"
            title="Purge all demo seed data so only your real database records are loaded"
          >
            <Trash2 className={`w-3.5 h-3.5 text-rose-500 ${isPurging ? 'animate-spin' : ''}`} />
            <span>{isPurging ? 'Purging...' : 'Purge Demo Data'}</span>
          </button>
        </div>
      </div>

      {seedSuccessNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{seedSuccessNotice}</span>
          </div>
          <button onClick={() => setSeedSuccessNotice(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Filter & Timeframe Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Timeframe Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {(['7d', '14d', '30d', 'all'] as const).map(tf => {
            const labelMap = {
              '7d': 'Last 7 Days',
              '14d': 'Last 14 Days',
              '30d': 'Last 30 Days (Monthly)',
              'all': 'All Records',
            };
            const active = timeframe === tf;
            return (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {labelMap[tf]}
              </button>
            );
          })}
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Depot Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              <span>Depot:</span>
            </span>
            <select
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Depots</option>
              {availableDepots.map(dep => (
                <option key={dep} value={dep}>{dep}</option>
              ))}
            </select>
          </div>

          {/* Truck Category Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Truck className="w-3.5 h-3.5" />
              <span>Category:</span>
            </span>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Trucks</option>
              <option value="Small Truck">Small Truck (Local Delivery)</option>
              <option value="Feeder">Feeder (Heavy / APAD Long Haul)</option>
            </select>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">Aggregating Fleet Pre-Trip Compliance Analytics...</p>
          <p className="text-xs text-slate-400 mt-1">Processing daily audit logs and defect telemetry</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-700">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
          <p className="text-sm font-bold">Failed to Load Fleet Analytics</p>
          <p className="text-xs mt-1">{error}</p>
          <button
            onClick={loadAnalytics}
            className="mt-4 px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition"
          >
            Retry
          </button>
        </div>
      ) : data ? (
        <>
          {/* 3. Executive KPI Metric Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Route Compliance Rate */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Route Compliance Rate</span>
                <span className="font-mono text-[11px] text-slate-400">Target: 95.0%</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold font-mono tracking-tight text-slate-900 tabular-nums">
                  {data.summary.complianceRate}%
                </span>
                <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${
                  data.summary.complianceRate >= 95 ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'
                }`}>
                  {data.summary.complianceRate >= 95 ? 'Meets Target' : 'Needs Action'}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>Completed Routes</span>
                <span className="font-mono tabular-nums text-slate-800 font-bold">
                  {data.summary.completedRoutes} / {data.summary.totalRoutes} routes
                </span>
              </div>
            </div>

            {/* Card 2: Composite Score */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Composite Quality Score</span>
                <span className="font-mono text-[11px] text-slate-400">Compliance & Grounded Deductions</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold font-mono tracking-tight text-blue-700 tabular-nums">
                  {data.summary.complianceScore}
                </span>
                <span className="text-xs text-slate-400 font-mono">/ 100</span>
                <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ml-auto ${
                  data.summary.complianceScore >= 90 ? 'text-blue-700 bg-blue-50' : 'text-amber-700 bg-amber-50'
                }`}>
                  {data.summary.complianceScore >= 90 ? 'Excellent' : 'Attention'}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>Calculation Basis</span>
                <span className="font-mono text-[11px] text-slate-600 font-medium">60% Routes + 40% Vehicle Health</span>
              </div>
            </div>

            {/* Card 3: Defect Rate & Grounded Fleet */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Defect Rate & Grounded</span>
                <span className="font-mono text-[11px] text-slate-400">{data.summary.totalDefectItemsLogged} defects logged</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-3xl font-extrabold font-mono tracking-tight tabular-nums ${
                  data.summary.defectRate > 5 ? 'text-red-600' : 'text-slate-900'
                }`}>
                  {data.summary.defectRate}%
                </span>
                <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ml-auto ${
                  data.summary.groundedVehiclesNow > 0 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  {data.summary.groundedVehiclesNow} Grounded
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>Inspection Failures</span>
                <span className="font-mono tabular-nums text-red-600 font-semibold">
                  {data.summary.defectCount} of {data.summary.totalInspections} failed
                </span>
              </div>
            </div>

            {/* Card 4: Inspection Throughput & Fleet */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Inspections & Fleet</span>
                <span className="font-mono text-[11px] text-slate-400">{data.meta.timeframe.toUpperCase()}</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold font-mono tracking-tight text-slate-900 tabular-nums">
                  {data.summary.totalInspections}
                </span>
                <span className="text-xs text-slate-400 font-mono">({data.summary.passedCount} clean)</span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>Active Fleet Inspected</span>
                <span className="font-mono tabular-nums text-slate-700 font-semibold">
                  {data.summary.activeVehiclesInspected} / {data.summary.totalFleetVehicles} ({data.summary.fleetCoverageRate}%)
                </span>
              </div>
            </div>
          </div>

          {/* 4. Weekly & Monthly Compliance Trend Chart */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <span>Compliance & Inspection Volume Trends</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daily pre-trip inspection completion and clean pass rate trajectory over {chartTrends.length} days
                </p>
              </div>

              {/* Chart Mode Toggles & Legend */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                  <button
                    onClick={() => setChartViewMode('both')}
                    className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition ${
                      chartViewMode === 'both' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Combined
                  </button>
                  <button
                    onClick={() => setChartViewMode('rate')}
                    className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition ${
                      chartViewMode === 'rate' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Compliance %
                  </button>
                  <button
                    onClick={() => setChartViewMode('volume')}
                    className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition ${
                      chartViewMode === 'volume' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Volume
                  </button>
                </div>

                <div className="hidden md:flex items-center gap-3 text-[11px] text-slate-500 font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-sm"></span> Passed Clean
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-red-500 rounded-sm"></span> Defect Flagged
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-emerald-600"></span> Compliance %
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive SVG Chart Container */}
            <div className="relative w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full min-w-[720px] h-[220px] select-none"
              >
                {/* Horizontal Gridlines */}
                {[0, 25, 50, 75, 100].map(pct => {
                  const y = paddingTop + plotHeight - (pct / 100) * plotHeight;
                  return (
                    <g key={pct}>
                      <line
                        x1={paddingLeft}
                        y1={y}
                        x2={svgWidth - paddingRight}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeDasharray={pct === 95 ? '4,4' : undefined}
                        strokeWidth={pct === 95 ? '1.5' : '1'}
                      />
                      <text
                        x={paddingLeft - 8}
                        y={y + 3.5}
                        fontSize="9"
                        fill="#94a3b8"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        {pct}%
                      </text>
                    </g>
                  );
                })}

                {/* 95% APAD Guideline Label */}
                <text
                  x={svgWidth - paddingRight - 4}
                  y={paddingTop + plotHeight - (95 / 100) * plotHeight - 4}
                  fontSize="8.5"
                  fill="#059669"
                  fontWeight="bold"
                  textAnchor="end"
                  fontFamily="sans-serif"
                >
                  95% Statutory Target
                </text>

                {/* Stacked Bars (Volume) */}
                {(chartViewMode === 'both' || chartViewMode === 'volume') && chartTrends.map((point, i) => {
                  const slotWidth = plotWidth / chartTrends.length;
                  const barWidth = Math.max(4, Math.min(18, slotWidth * 0.65));
                  const x = paddingLeft + i * slotWidth + (slotWidth - barWidth) / 2;

                  const totalH = (point.inspected / maxInspected) * (plotHeight * 0.75);
                  const passH = point.inspected > 0 ? (point.passed / point.inspected) * totalH : 0;
                  const defH = totalH - passH;

                  const yBottom = paddingTop + plotHeight;
                  const yPass = yBottom - passH;
                  const yDef = yPass - defH;

                  return (
                    <g
                      key={`bar-${point.date}`}
                      className="cursor-pointer transition-opacity hover:opacity-80"
                      onMouseEnter={() => setActiveHoverPoint(point)}
                      onMouseLeave={() => setActiveHoverPoint(null)}
                    >
                      {/* Clean Pass Bar */}
                      <rect
                        x={x}
                        y={yPass}
                        width={barWidth}
                        height={passH}
                        fill="#2563eb"
                        rx="1"
                      />
                      {/* Defect Bar */}
                      {defH > 0 && (
                        <rect
                          x={x}
                          y={yDef}
                          width={barWidth}
                          height={defH}
                          fill="#ef4444"
                          rx="1"
                        />
                      )}
                    </g>
                  );
                })}

                {/* Compliance Rate Line & Area */}
                {(chartViewMode === 'both' || chartViewMode === 'rate') && chartTrends.length > 1 && (() => {
                  const points = chartTrends.map((p, i) => {
                    const slotWidth = plotWidth / chartTrends.length;
                    const x = paddingLeft + i * slotWidth + slotWidth / 2;
                    const y = paddingTop + plotHeight - (p.complianceRate / 100) * plotHeight;
                    return { x, y, point: p };
                  });

                  const dPath = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');

                  return (
                    <g>
                      {/* Trend Line */}
                      <path
                        d={dPath}
                        fill="none"
                        stroke="#059669"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Data Dots */}
                      {points.map((pt, idx) => (
                        <circle
                          key={`dot-${pt.point.date}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={chartTrends.length > 20 ? '2' : '3'}
                          fill="#ffffff"
                          stroke="#059669"
                          strokeWidth="2"
                          className="cursor-pointer"
                          onMouseEnter={() => setActiveHoverPoint(pt.point)}
                          onMouseLeave={() => setActiveHoverPoint(null)}
                        />
                      ))}
                    </g>
                  );
                })()}

                {/* X-Axis Date Ticks */}
                {chartTrends.map((point, i) => {
                  const step = chartTrends.length > 20 ? Math.ceil(chartTrends.length / 8) : 2;
                  if (i % step !== 0 && i !== chartTrends.length - 1) return null;

                  const slotWidth = plotWidth / chartTrends.length;
                  const x = paddingLeft + i * slotWidth + slotWidth / 2;
                  const y = paddingTop + plotHeight + 16;

                  return (
                    <text
                      key={`label-${point.date}`}
                      x={x}
                      y={y}
                      fontSize="9"
                      fill="#64748b"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {point.shortDate}
                    </text>
                  );
                })}
              </svg>

              {/* Hover Tooltip Box */}
              {activeHoverPoint && (
                <div className="absolute top-2 right-4 bg-slate-900 text-white p-2.5 rounded-xl text-xs shadow-xl border border-slate-700 pointer-events-none z-10 font-mono">
                  <div className="font-bold text-slate-200 border-b border-slate-800 pb-1 mb-1">
                    {activeHoverPoint.dayLabel} ({activeHoverPoint.date})
                  </div>
                  <div className="space-y-0.5 text-[11px]">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-400">Inspections:</span>
                      <span className="font-bold">{activeHoverPoint.inspected}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-emerald-400">Passed:</span>
                      <span className="font-bold">{activeHoverPoint.passed}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-red-400">Defects:</span>
                      <span className="font-bold">{activeHoverPoint.defects}</span>
                    </div>
                    <div className="flex justify-between gap-4 pt-1 border-t border-slate-800 font-bold">
                      <span className="text-slate-300">Compliance:</span>
                      <span className={activeHoverPoint.complianceRate >= 95 ? 'text-emerald-400' : 'text-amber-400'}>
                        {activeHoverPoint.complianceRate}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 5. Two-Column Grid: Depot Leaderboard & Recurring Defect Hotspots */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 Columns: Depot Performance Rankings */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    <span>Depot Completion & Performance Rankings</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ranked by Composite Score (60% Route Compliance + 40% Vehicle Health / Grounded Deductions)
                  </p>
                </div>
                <span className="text-xs font-mono font-medium text-slate-400">
                  {data.depotRankings.length} Hubs
                </span>
              </div>

              {/* Scrollable Depot Leaderboard Container */}
              <div className="overflow-x-auto overflow-y-auto max-h-[380px] rounded-xl border border-slate-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/95 backdrop-blur border-b border-slate-200 text-slate-700 font-semibold uppercase text-[10px] tracking-wider font-mono sticky top-0 z-10 shadow-xs">
                    <tr>
                      <th className="py-2.5 px-2.5">Rank</th>
                      <th className="py-2.5 px-2.5">Depot Hub</th>
                      <th className="py-2.5 px-2 text-right">Fleet</th>
                      <th className="py-2.5 px-2.5 text-right">Routes Done</th>
                      <th className="py-2.5 px-2.5 text-right">Compliance Rate</th>
                      <th className="py-2.5 px-2.5 text-right">Grounded</th>
                      <th className="py-2.5 px-2.5 text-right">Defect Rate</th>
                      <th className="py-2.5 px-2.5 text-right">Score</th>
                      <th className="py-2.5 px-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.depotRankings.map(d => {
                      const medalColor =
                        d.rank === 1 ? 'bg-amber-100 text-amber-800 border-amber-300' :
                        d.rank === 2 ? 'bg-slate-200 text-slate-800 border-slate-300' :
                        d.rank === 3 ? 'bg-amber-900/10 text-amber-900 border-amber-700/30' :
                        'bg-slate-50 text-slate-600 border-slate-200';

                      return (
                        <tr key={d.depot} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-2.5 font-mono font-bold">
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold border ${medalColor}`}>
                              {d.rank}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5">
                            <div className="font-bold text-slate-900">{d.depot}</div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[130px]">{d.depotName}</div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700">
                            {d.assignedVehicles}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                            <span className="font-bold text-slate-900">{d.completedRoutes}</span>
                            <span className="text-slate-400 text-[10px]"> / {d.totalRoutes}</span>
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-bold">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className={d.complianceRate >= 95 ? 'text-emerald-700' : d.complianceRate >= 88 ? 'text-blue-700' : 'text-amber-700'}>
                                {d.complianceRate}%
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-bold">
                            {d.groundedVehicles > 0 ? (
                              <span className="text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-[11px]">
                                {d.groundedVehicles} Grounded
                              </span>
                            ) : (
                              <span className="text-emerald-700 text-[11px]">0 Grounded</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold">
                            <span className={d.defectRate > 5 ? 'text-red-600' : 'text-slate-700'}>
                              {d.defectRate}%
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono font-extrabold tabular-nums text-slate-900">
                            {d.complianceScore}
                          </td>
                          <td className="py-2.5 px-2.5 text-center">
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                              d.statusTier === 'Exceptional' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                              d.statusTier === 'Compliant' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                              'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}>
                              {d.statusTier}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right 5 Columns: Top Recurring Defect Categories (Hotspots) */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <span>Recurring Defect Hotspots</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Frequent failure categories requiring preventive workshop attention
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                    {data.summary.totalDefectItemsLogged} Defects
                  </span>
                </div>

                {/* Scrollable Hotspot Cards Container */}
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {data.defectHotspots.slice(0, 6).map((hotspot, idx) => {
                    const isExpanded = expandedHotspotId === hotspot.checkpointId;
                    const severityBadge =
                      hotspot.severity === 'Critical' ? 'bg-red-50 text-red-700 border-red-200' :
                      hotspot.severity === 'High' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      hotspot.severity === 'Medium' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      'bg-slate-50 text-slate-600 border-slate-200';

                    return (
                      <div
                        key={hotspot.checkpointId}
                        className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-xl transition-all"
                      >
                        <div
                          className="flex items-start justify-between gap-2 cursor-pointer"
                          onClick={() => setExpandedHotspotId(isExpanded ? null : hotspot.checkpointId)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono font-bold text-slate-400">#{idx + 1}</span>
                              <span className="text-xs font-bold text-slate-900 truncate">{hotspot.title}</span>
                              <span className={`text-[9px] uppercase font-mono font-bold px-1.5 py-0.2 rounded border ${severityBadge}`}>
                                {hotspot.severity}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                              <span>{hotspot.category}</span>
                              <span>·</span>
                              <span className="font-mono">{hotspot.defectCount} incidents ({hotspot.percentage}%)</span>
                            </div>
                          </div>
                          
                          <button className="text-slate-400 hover:text-slate-700 pt-0.5">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {/* Visual Progress Line */}
                        <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              hotspot.severity === 'Critical' ? 'bg-red-500' :
                              hotspot.severity === 'High' ? 'bg-amber-500' :
                              'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(100, hotspot.percentage * 2.5)}%` }}
                          />
                        </div>

                        {/* Expanded Root Causes & Affected Vehicles */}
                        {isExpanded && (
                          <div className="mt-2.5 pt-2 border-t border-slate-200 text-[11px] space-y-1.5">
                            <div>
                              <span className="text-slate-500 font-semibold block text-[10px] uppercase">Common Root Causes:</span>
                              <p className="text-slate-700">{hotspot.commonIssues.join(', ')}</p>
                            </div>
                            {hotspot.topRemarks.length > 0 && (
                              <div>
                                <span className="text-slate-500 font-semibold block text-[10px] uppercase">Sample Driver Defect Note:</span>
                                <p className="text-slate-600 italic">"{hotspot.topRemarks[0]}"</p>
                              </div>
                            )}
                            {hotspot.affectedVehicles.length > 0 && (
                              <div>
                                <span className="text-slate-500 font-semibold block text-[10px] uppercase">Sample Vehicles Flagged:</span>
                                <span className="font-mono text-slate-800 font-semibold">{hotspot.affectedVehicles.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Click any hotspot to inspect root causes</span>
                <span className="font-mono text-[10px] text-slate-400">PDI / Workshop Protocol</span>
              </div>
            </div>
          </div>

          {/* 5b. Daily Performance & Compliance Breakdown per Depot */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>Daily Performance & Compliance per Depot</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daily pre-trip inspection logs, fleet route compliance rates, grounded vehicles, and defect rates per depot hub.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Depot Hub Filter */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium">Depot:</span>
                  <select
                    value={dailyDepotFilter}
                    onChange={e => setDailyDepotFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-mono font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="ALL">All Depots</option>
                    {availableDepots.map(dep => (
                      <option key={dep} value={dep}>{dep}</option>
                    ))}
                  </select>
                </div>

                {/* Interactive Date Picker */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>Date:</span>
                  </span>
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={dailyDateFilter === 'ALL' ? '' : dailyDateFilter}
                      min={minDailyDate}
                      max={maxDailyDate}
                      onChange={e => setDailyDateFilter(e.target.value || 'ALL')}
                      className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-mono font-bold rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                      title="Pick a specific date to view that day's compliance, defect rate, and grounded fleet"
                    />
                    {dailyDateFilter !== 'ALL' && (
                      <button
                        onClick={() => setDailyDateFilter('ALL')}
                        className="absolute right-1.5 p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-full transition cursor-pointer"
                        title="Clear date filter (show all dates)"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Date Quick Presets */}
                  <div className="hidden sm:flex items-center gap-1">
                    <button
                      onClick={() => setDailyDateFilter('ALL')}
                      className={`px-2 py-1 text-[11px] font-semibold rounded-md border transition cursor-pointer ${
                        dailyDateFilter === 'ALL'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      All Dates
                    </button>
                    {uniqueDailyDates.length > 0 && (
                      <button
                        onClick={() => setDailyDateFilter(uniqueDailyDates[0])}
                        className={`px-2 py-1 text-[11px] font-semibold rounded-md border transition cursor-pointer ${
                          dailyDateFilter === uniqueDailyDates[0]
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                        title={`View latest audit records for ${uniqueDailyDates[0]}`}
                      >
                        Latest ({uniqueDailyDates[0].slice(5)})
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search depot or date..."
                    value={dailySearch}
                    onChange={e => setDailySearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-44 sm:w-52"
                  />
                </div>
              </div>
            </div>

            {/* Selected Day Performance Snapshot (Appears when a specific date is picked) */}
            {selectedDaySummary && (
              <div className="p-3.5 bg-gradient-to-r from-blue-50/90 via-slate-50 to-emerald-50/70 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-blue-900 bg-white px-2.5 py-1 rounded-md border border-blue-200 shadow-xs">
                    {selectedDaySummary.formattedDate}
                  </span>
                  <span className="text-slate-600 font-medium">
                    Fleet audit performance across {selectedDaySummary.depotsCount} depot hubs:
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Route Compliance:</span>
                    <span className="font-bold text-slate-900">
                      {selectedDaySummary.completedRoutes} / {selectedDaySummary.totalRoutes}
                    </span>
                    <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                      selectedDaySummary.complianceRate >= 95 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {selectedDaySummary.complianceRate}%
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Defect Rate:</span>
                    <span className={`font-bold ${selectedDaySummary.defectRate > 5 ? 'text-red-600' : 'text-slate-900'}`}>
                      {selectedDaySummary.defectRate}%
                    </span>
                    <span className="text-[11px] text-slate-400">({selectedDaySummary.defectCount} failures)</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Grounded:</span>
                    <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                      selectedDaySummary.groundedVehicles > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {selectedDaySummary.groundedVehicles} Grounded
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Quality Score:</span>
                    <span className="font-extrabold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                      {selectedDaySummary.avgScore} / 100
                    </span>
                  </div>

                  <button
                    onClick={() => setDailyDateFilter('ALL')}
                    className="text-slate-400 hover:text-slate-700 ml-1 p-1 hover:bg-white rounded-md transition cursor-pointer"
                    title="Reset to All Dates"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Scrollable Daily Table Container */}
            <div className="overflow-x-auto overflow-y-auto max-h-[460px] rounded-xl border border-slate-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/95 backdrop-blur border-b border-slate-200 text-slate-700 font-semibold uppercase text-[10px] tracking-wider font-mono sticky top-0 z-10 shadow-xs">
                  <tr>
                    <th className="py-2.5 px-2.5">Date</th>
                    <th className="py-2.5 px-2">Depot Hub</th>
                    <th className="py-2.5 px-2 text-right">Fleet</th>
                    <th className="py-2.5 px-2 text-right">Routes Done</th>
                    <th className="py-2.5 px-2.5 text-right">Compliance Rate</th>
                    <th className="py-2.5 px-2 text-right">Inspections</th>
                    <th className="py-2.5 px-2 text-right">Grounded</th>
                    <th className="py-2.5 px-2 text-right">Defect Rate</th>
                    <th className="py-2.5 px-2 text-right">Score</th>
                    <th className="py-2.5 px-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedDailyMetrics.map((m, idx) => {
                    const statusTier = m.statusTier || (m.complianceRate >= 95 && m.defectCount === 0 ? 'Exceptional' : (m.complianceRate < 88 || m.defectCount > 0 ? 'Needs Attention' : 'Compliant'));
                    return (
                      <tr key={`${m.date}-${m.depot}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                          {m.formattedDate || m.date}
                        </td>
                        <td className="py-2.5 px-2">
                          <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {m.depot}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700">
                          {m.assignedVehicles}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          <span className="font-bold text-slate-900">{m.completedRoutes}</span>
                          <span className="text-slate-400 text-[10px]"> / {m.totalRoutes}</span>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono font-bold tabular-nums">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="w-12 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  m.complianceRate >= 95 ? 'bg-emerald-500' :
                                  m.complianceRate >= 88 ? 'bg-blue-500' :
                                  'bg-amber-500'
                                }`}
                                style={{ width: `${Math.min(100, m.complianceRate)}%` }}
                              />
                            </div>
                            <span className={m.complianceRate >= 95 ? 'text-emerald-700' : m.complianceRate >= 88 ? 'text-blue-700' : 'text-amber-700'}>
                              {m.complianceRate}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                          <span>{m.totalInspections}</span>
                          <span className="text-[10px] text-slate-400 block font-normal">({m.passedCount}P / {m.defectCount}F)</span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {m.groundedVehicles > 0 ? (
                            <span className="text-red-600 bg-red-50 border border-red-200 px-1 py-0.5 rounded text-[10px] font-bold">
                              {m.groundedVehicles} Grounded
                            </span>
                          ) : (
                            <span className="text-emerald-700 text-[11px] font-medium">0 Grounded</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold">
                          <span className={m.defectRate > 5 ? 'text-red-600' : 'text-slate-700'}>
                            {m.defectRate}%
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-extrabold tabular-nums text-slate-900">
                          {m.score}
                        </td>
                        <td className="py-2.5 px-2.5 text-center">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                            statusTier === 'Exceptional' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                            statusTier === 'Compliant' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                            'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}>
                            {statusTier}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedDailyMetrics.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Calendar className="w-8 h-8 text-slate-300" />
                          <p className="font-semibold text-slate-600 text-sm">No daily depot records found</p>
                          <p className="text-xs text-slate-400 max-w-sm">
                            {dailyDateFilter !== 'ALL'
                              ? `No pre-trip audits logged for date ${dailyDateFilter}.`
                              : 'No entries match your current search or filters.'}
                          </p>
                          {(dailyDateFilter !== 'ALL' || dailyDepotFilter !== 'ALL' || dailySearch) && (
                            <button
                              onClick={() => {
                                setDailyDateFilter('ALL');
                                setDailyDepotFilter('ALL');
                                setDailySearch('');
                              }}
                              className="mt-2 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100 transition cursor-pointer"
                            >
                              Reset All Filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredDailyMetrics.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 gap-2">
                <span>
                  Showing {Math.min(filteredDailyMetrics.length, (dailyPage - 1) * dailyPageSize + 1)} to {Math.min(filteredDailyMetrics.length, dailyPage * dailyPageSize)} of {filteredDailyMetrics.length} daily depot entries
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setDailyPage(p => Math.max(1, p - 1))}
                    disabled={dailyPage === 1}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 font-semibold"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <span className="font-mono px-2 font-bold text-slate-800">
                    {dailyPage} / {totalDailyPages}
                  </span>
                  <button
                    onClick={() => setDailyPage(p => Math.min(totalDailyPages, p + 1))}
                    disabled={dailyPage >= totalDailyPages}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 font-semibold"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 6. Recent Defect Incidents Action Register */}
          {data.recentDefectLogs && data.recentDefectLogs.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-slate-700" />
                    <span>Recent Defect Action Register</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Latest vehicles flagged with defects requiring mechanic maintenance sign-off
                  </p>
                </div>
                <span className="text-xs font-mono font-medium text-slate-400">
                  {data.recentDefectLogs.length} Logged Entries
                </span>
              </div>

              {/* Scrollable Defect Action Register Container */}
              <div className="overflow-x-auto overflow-y-auto max-h-[360px] rounded-xl border border-slate-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/95 backdrop-blur border-b border-slate-200 text-slate-700 font-semibold uppercase text-[10px] tracking-wider font-mono sticky top-0 z-10 shadow-xs">
                    <tr>
                      <th className="py-2.5 px-3">Date / Time</th>
                      <th className="py-2.5 px-3">Vehicle Plate</th>
                      <th className="py-2.5 px-3">Depot</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Inspecting Driver</th>
                      <th className="py-2.5 px-3">Defect Summary & Failed Checkpoint</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recentDefectLogs.slice(0, 8).map(log => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                          {log.formattedDate}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {log.vehicleNo}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-700">
                          {log.vehicleBranch}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {log.truckCategory || 'Small Truck'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 font-medium">
                          {log.driverName}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-red-700 line-clamp-1">{log.defectSummary}</div>
                          {log.failedItems && log.failedItems.length > 0 && (
                            <div className="text-[10px] text-slate-500 truncate max-w-[280px]">
                              {log.failedItems.map(it => it.title).join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded font-mono bg-red-50 text-red-700 border border-red-200">
                            Grounded
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7. Statutory Regulatory Footer */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Audited in compliance with APAD Act 715, JPJ Roadworthiness Guidelines, and Commercial Vehicle Safety Equipment Schedules.
              </span>
            </div>
            <div className="font-mono text-[11px] text-slate-400 shrink-0">
              Audit Hash: #{data.meta.startDate.replace(/-/g, '')}-{data.summary.totalInspections}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
