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
  Layers,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { ExecutiveAnalyticsData, DailyTrendPoint, DepotRankingItem, DefectHotspotItem } from '../../types';
import { fetchExecutiveAnalytics, seedDemoInspections, fetchDepots } from '../../lib/api';
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

  // Loading indicator for seed demo
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [seedSuccessNotice, setSeedSuccessNotice] = useState<string | null>(null);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchExecutiveAnalytics({
        timeframe,
        branch: selectedBranch,
        truckCategory: selectedCategory,
      });
      setData(res);
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

  const handleExportExcel = () => {
    if (!data) return;
    exportExecutiveSummaryToExcel(data);
  };

  const handleExportPdf = () => {
    if (!data) return;
    exportExecutiveSummaryToPdf(data);
  };

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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Executive Compliance & Fleet Analytics
            </h1>
            <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              APAD Act 715
            </span>
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
            disabled={isSeeding || loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition cursor-pointer"
            title="Populate demo 30-day historical inspections if database is new"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSeeding ? 'animate-spin' : ''}`} />
            <span>{isSeeding ? 'Generating...' : 'Seed Audit Data'}</span>
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
            {/* Card 1: Fleet Compliance Rate */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Fleet Compliance Rate</span>
                <span className="font-mono text-[11px] text-slate-400">Benchmark: 95.0%</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold font-mono tracking-tight text-slate-900 tabular-nums">
                  {data.summary.complianceRate}%
                </span>
                <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${
                  data.summary.complianceRate >= 95 ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'
                }`}>
                  {data.summary.complianceRate >= 95 ? 'Meets Target' : 'Observation'}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>First-time pass without defects</span>
                <span className="font-mono tabular-nums text-slate-700 font-semibold">{data.summary.firstTimePassRate}%</span>
              </div>
            </div>

            {/* Card 2: Total Pre-Trip Inspections */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Total Inspections</span>
                <span className="font-mono text-[11px] text-slate-400">{data.meta.timeframe.toUpperCase()} Window</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold font-mono tracking-tight text-slate-900 tabular-nums">
                  {data.summary.totalInspections}
                </span>
                <span className="text-xs text-slate-500 font-medium">completed</span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>Daily average throughput</span>
                <span className="font-mono tabular-nums text-slate-700 font-semibold">{data.summary.avgInspectionsPerDay}/day</span>
              </div>
            </div>

            {/* Card 3: Passed vs Defective Ratio */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Pass / Defect Outcome</span>
                <span className="font-mono text-[11px] text-slate-400">{data.summary.totalDefectItemsLogged} items flagged</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono tracking-tight text-emerald-700 tabular-nums">
                  {data.summary.passedCount}
                </span>
                <span className="text-xs text-slate-400">clean /</span>
                <span className="text-2xl font-bold font-mono tracking-tight text-red-600 tabular-nums">
                  {data.summary.defectCount}
                </span>
                <span className="text-xs text-slate-400">defective</span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>Currently grounded vehicles</span>
                <span className={`font-mono tabular-nums font-bold ${
                  data.summary.groundedVehiclesNow > 0 ? 'text-red-600' : 'text-emerald-600'
                }`}>
                  {data.summary.groundedVehiclesNow} Grounded
                </span>
              </div>
            </div>

            {/* Card 4: Active Fleet Coverage */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Fleet Coverage</span>
                <span className="font-mono text-[11px] text-slate-400">{data.meta.selectedBranch}</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold font-mono tracking-tight text-blue-700 tabular-nums">
                  {data.summary.activeVehiclesInspected}
                </span>
                <span className="text-xs text-slate-400">/ {data.summary.totalFleetVehicles} vehicles</span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>Active vehicle participation</span>
                <span className="font-mono tabular-nums text-slate-700 font-semibold">{data.summary.fleetCoverageRate}%</span>
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
                    Ranked by weighted compliance score (60% Clean Pass + 40% Completion Rate)
                  </p>
                </div>
                <span className="text-xs font-mono font-medium text-slate-400">
                  {data.depotRankings.length} Hubs
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-y border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider font-mono">
                    <tr>
                      <th className="py-2.5 px-3">Rank</th>
                      <th className="py-2.5 px-3">Depot Hub</th>
                      <th className="py-2.5 px-3 text-right">Fleet</th>
                      <th className="py-2.5 px-3 text-right">Inspected</th>
                      <th className="py-2.5 px-3 text-right">Pass %</th>
                      <th className="py-2.5 px-3 text-right">Score</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
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
                          <td className="py-2.5 px-3 font-mono font-bold">
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold border ${medalColor}`}>
                              {d.rank}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{d.depot}</div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[170px]">{d.depotName}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                            {d.assignedVehicles}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            <span className="font-semibold text-slate-900">{d.totalInspections}</span>
                            <span className="text-[10px] text-slate-400 block">{d.defectCount} defects</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                            <span className={d.passRate >= 95 ? 'text-emerald-700' : d.passRate >= 88 ? 'text-slate-800' : 'text-red-600'}>
                              {d.passRate}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-slate-900">
                            {d.complianceScore}
                          </td>
                          <td className="py-2.5 px-3 text-center">
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

                <div className="space-y-3">
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

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-y border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider font-mono">
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
