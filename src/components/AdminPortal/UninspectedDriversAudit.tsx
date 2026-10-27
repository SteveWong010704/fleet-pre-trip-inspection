import React, { useState, useEffect, useMemo } from 'react';
import { UninspectedDriversReportResult, UninspectedDriverItem } from '../../types';
import { fetchUninspectedDriversReportApi, fetchDrivers, fetchDepots } from '../../lib/api';
import {
  AlertTriangle,
  Calendar,
  Building2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  FileText,
  FileCode,
  Printer,
  RefreshCw,
  Phone,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Users,
  ShieldAlert,
  ChevronDown,
  Layers,
  CalendarDays,
  ExternalLink,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface UninspectedDriversAuditProps {
  activeAdmin?: any;
  onSelectDriver?: (driverId: string) => void;
}

const FOMS_TIME_ZONE = 'Asia/Kuala_Lumpur';

function getTodayMalaysia(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: FOMS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find(p => p.type === 'year')?.value || '2026';
    const m = parts.find(p => p.type === 'month')?.value || '10';
    const d = parts.find(p => p.type === 'day')?.value || '26';
    return `${y}-${m}-${d}`;
  } catch {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export const UninspectedDriversAudit: React.FC<UninspectedDriversAuditProps> = ({
  activeAdmin,
  onSelectDriver,
}) => {
  const today = useMemo(() => getTodayMalaysia(), []);

  // Filter States
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [dateFrom, setDateFrom] = useState<string>(today);
  const [dateTo, setDateTo] = useState<string>(today);
  const [selectedDepot, setSelectedDepot] = useState<string>(
    activeAdmin?.assignedDepot && activeAdmin.assignedDepot !== 'ALL'
      ? activeAdmin.assignedDepot
      : 'ALL'
  );
  const [search, setSearch] = useState<string>('');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('ALL');
  const [filterComplianceOnly, setFilterComplianceOnly] = useState<'uninspected_only' | 'all'>('uninspected_only');

  // Sorting
  const [sortField, setSortField] = useState<'missedCount' | 'name' | 'depot' | 'employeeId'>('missedCount');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // View Mode: 'summary' (grouped drivers) vs 'daily_roster' (day by day breakdown)
  const [activeViewMode, setActiveViewMode] = useState<'summary' | 'daily_roster'>('summary');

  // Data & Loading States
  const [loading, setLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<UninspectedDriversReportResult | null>(null);
  const [availableDepots, setAvailableDepots] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Use Depot management as the source of truth for depot filters.
  // Driver depots are included only as a fallback/legacy safety net.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchDepots().catch(() => []),
      fetchDrivers().catch(() => []),
    ]).then(([masterDepots, drivers]) => {
      if (cancelled) return;
      const codes = new Set<string>();
      (masterDepots || []).forEach(depot => {
        const code = String(depot.code || depot.id || '').trim().toUpperCase();
        if (code) codes.add(code);
      });
      if (codes.size === 0) {
        (drivers || []).forEach(driver => {
          const code = String(driver.depot || '').trim().toUpperCase();
          if (code) codes.add(code);
        });
      }
      const assignedDepot = String(activeAdmin?.assignedDepot || '').trim().toUpperCase();
      if (assignedDepot && assignedDepot !== 'ALL') codes.add(assignedDepot);
      setAvailableDepots(Array.from(codes).sort());
    });
    return () => { cancelled = true; };
  }, [activeAdmin?.assignedDepot]);

  // Fetch report when filters change
  const loadReport = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const effectiveFrom = dateMode === 'single' ? selectedDate : dateFrom;
      const effectiveTo = dateMode === 'single' ? selectedDate : dateTo;

      const res = await fetchUninspectedDriversReportApi({
        dateFrom: effectiveFrom,
        dateTo: effectiveTo,
        depot: selectedDepot,
        search,
        designation: selectedDesignation,
        sortBy: sortField,
        sortOrder: sortDirection,
      });

      setReportData(res);
    } catch (err: any) {
      console.error('Failed to load uninspected drivers report:', err);
      setErrorMsg(err.message || 'Error loading uninspected drivers report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [
    dateMode,
    selectedDate,
    dateFrom,
    dateTo,
    selectedDepot,
    selectedDesignation,
    sortField,
    sortDirection,
  ]);

  // Handle preset date buttons
  const applyPreset = (preset: 'today' | 'yesterday' | 'last7' | 'last14' | 'this_month') => {
    const cur = new Date();
    const parts = today.split('-').map(Number);
    const baseDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    if (preset === 'today') {
      setDateMode('single');
      setSelectedDate(today);
      setDateFrom(today);
      setDateTo(today);
    } else if (preset === 'yesterday') {
      const y = new Date(baseDate);
      y.setUTCDate(y.getUTCDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      setDateMode('single');
      setSelectedDate(yStr);
      setDateFrom(yStr);
      setDateTo(yStr);
    } else if (preset === 'last7') {
      const start = new Date(baseDate);
      start.setUTCDate(start.getUTCDate() - 6);
      setDateMode('range');
      setDateFrom(start.toISOString().split('T')[0]);
      setDateTo(today);
    } else if (preset === 'last14') {
      const start = new Date(baseDate);
      start.setUTCDate(start.getUTCDate() - 13);
      setDateMode('range');
      setDateFrom(start.toISOString().split('T')[0]);
      setDateTo(today);
    } else if (preset === 'this_month') {
      const y = parts[0];
      const m = String(parts[1]).padStart(2, '0');
      setDateMode('range');
      setDateFrom(`${y}-${m}-01`);
      setDateTo(today);
    }
  };

  // Filtered driver list according to uninspected_only / all
  const displayedDrivers = useMemo(() => {
    if (!reportData) return [];
    let list = reportData.drivers;

    if (filterComplianceOnly === 'uninspected_only') {
      list = list.filter(d => d.missedCount > 0);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        d =>
          d.name.toLowerCase().includes(q) ||
          d.employeeId.toLowerCase().includes(q) ||
          d.loginId.toLowerCase().includes(q) ||
          d.phone.toLowerCase().includes(q) ||
          d.depot.toLowerCase().includes(q)
      );
    }

    return list;
  }, [reportData, filterComplianceOnly, search]);

  // Sorting Handler
  const handleSort = (field: 'missedCount' | 'name' | 'depot' | 'employeeId') => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'missedCount' ? 'desc' : 'asc');
    }
  };

  // ===================== REPORT EXTRACTION =====================

  // 1. Export Excel (.xlsx)
  const handleExportExcel = () => {
    if (!reportData || displayedDrivers.length === 0) return;

    const fromDate = dateMode === 'single' ? selectedDate : dateFrom;
    const toDate = dateMode === 'single' ? selectedDate : dateTo;

    const rows = displayedDrivers.map((d, idx) => ({
      'No.': idx + 1,
      'Employee ID': d.employeeId,
      'Login ID': d.loginId,
      'Driver Name': d.name,
      'Depot': d.depot,
      'Designation': d.designation,
      'Phone': d.phone,
      'Total Days In Period': d.totalDays,
      'Missed Inspection Days': d.missedCount,
      'Inspected Days': d.inspectedCount,
      'Compliance Rate (%)': `${d.complianceRate}%`,
      'Status': d.complianceStatus,
      'Missing Inspection Dates': d.missedDates.map(formatDisplayDate).join(', ') || 'None (Compliant)',
      'Latest Inspection Date': d.latestInspectionDate ? formatDisplayDate(d.latestInspectionDate) : 'No Records',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Uninspected Drivers');

    // Auto-fit column widths
    const max_width = [6, 14, 12, 30, 10, 15, 18, 12, 14, 14, 16, 20, 45, 18];
    worksheet['!cols'] = max_width.map(w => ({ wch: w }));

    const filename = `Uninspected_Drivers_Audit_${fromDate}_to_${toDate}_${selectedDepot}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  // 2. Export CSV (.csv)
  const handleExportCSV = () => {
    if (!reportData || displayedDrivers.length === 0) return;

    const fromDate = dateMode === 'single' ? selectedDate : dateFrom;
    const toDate = dateMode === 'single' ? selectedDate : dateTo;

    const headers = [
      'No',
      'Employee ID',
      'Login ID',
      'Driver Name',
      'Depot',
      'Designation',
      'Phone',
      'Total Days',
      'Missed Days',
      'Inspected Days',
      'Compliance Rate',
      'Status',
      'Missing Dates',
    ];

    const csvRows = [
      headers.join(','),
      ...displayedDrivers.map((d, idx) => [
        idx + 1,
        `"${d.employeeId}"`,
        `"${d.loginId}"`,
        `"${d.name.replace(/"/g, '""')}"`,
        `"${d.depot}"`,
        `"${d.designation}"`,
        `"${d.phone}"`,
        d.totalDays,
        d.missedCount,
        d.inspectedCount,
        `"${d.complianceRate}%"`,
        `"${d.complianceStatus}"`,
        `"${d.missedDates.map(formatDisplayDate).join('; ')}"`,
      ].join(',')),
    ];

    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Uninspected_Drivers_Report_${fromDate}_to_${toDate}_${selectedDepot}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 3. Export PDF (.pdf)
  const handleExportPDF = () => {
    if (!reportData || displayedDrivers.length === 0) return;

    const fromDate = dateMode === 'single' ? selectedDate : dateFrom;
    const toDate = dateMode === 'single' ? selectedDate : dateTo;

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    // Header styling
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 297, 24, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('FLEET PRE-TRIP INSPECTION AUDIT - DRIVERS MISSING INSPECTION REPORT', 14, 11);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      `Period: ${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)} | Depot: ${selectedDepot} | Generated: ${new Date().toLocaleString('en-GB', { timeZone: FOMS_TIME_ZONE })}`,
      14,
      18
    );

    // KPI Summary Bar
    const summary = reportData.summary;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(14, 28, 269, 14, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 28, 269, 14, 2, 2, 'D');

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Total Monitored Drivers: ${summary.totalActiveDrivers}    |    Drivers Missing Inspection: ${summary.uninspectedDriversCount}    |    Fully Compliant: ${summary.fullyCompliantCount}    |    Compliance Rate: ${summary.overallComplianceRate}%`,
      18,
      37
    );

    // Table
    const tableData = displayedDrivers.map((d, idx) => [
      idx + 1,
      d.employeeId,
      d.name,
      d.depot,
      d.designation,
      d.phone || '-',
      d.missedCount,
      `${d.complianceRate}%`,
      d.complianceStatus,
      d.missedDates.map(formatDisplayDate).join(', ') || 'None',
    ]);

    autoTable(doc, {
      startY: 46,
      head: [[
        'No',
        'Emp ID',
        'Driver Name',
        'Depot',
        'Role',
        'Phone',
        'Missed',
        'Rate',
        'Status',
        'Dates Missed (Pre-Trip Inspection Not Performed)',
      ]],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'left',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 65, 85],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 18, fontStyle: 'bold' },
        2: { cellWidth: 45 },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 20 },
        5: { cellWidth: 25 },
        6: { cellWidth: 15, halign: 'center', fontStyle: 'bold', textColor: [225, 29, 72] },
        7: { cellWidth: 15, halign: 'center' },
        8: { cellWidth: 25, halign: 'center' },
        9: { cellWidth: 'auto' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 8) {
          const val = String(data.cell.raw);
          if (val === 'Non-Compliant') {
            data.cell.styles.textColor = [225, 29, 72];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'Partially Compliant') {
            data.cell.styles.textColor = [217, 119, 6];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [16, 185, 129];
          }
        }
      },
      margin: { left: 14, right: 14 },
    });

    const filename = `Drivers_Missing_Inspection_Audit_${fromDate}_to_${toDate}_${selectedDepot}.pdf`;
    doc.save(filename);
  };

  // 4. Print
  const handlePrint = () => {
    window.print();
  };

  const fromDisplay = dateMode === 'single' ? selectedDate : dateFrom;
  const toDisplay = dateMode === 'single' ? selectedDate : dateTo;

  return (
    <div className="space-y-6">
      {/* Top Filter and Configuration Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-slate-800 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600">
                <ShieldAlert className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Uninspected Drivers Compliance Audit
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                <Clock className="w-3 h-3 text-blue-500" />
                <span>Malaysia Time (MYT / UTC+8)</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Audit and track drivers who did not perform pre-trip inspections for any specific date or custom date range, grouped by depot.
            </p>
          </div>

          {/* Report Extraction Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportPDF}
              disabled={displayedDrivers.length === 0}
              className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
              title="Extract formal compliance audit report in PDF"
            >
              <FileText className="w-4 h-4 text-rose-400" />
              <span>Extract PDF</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={displayedDrivers.length === 0}
              className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
              title="Extract detailed spreadsheet in Excel format (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Extract Excel (.xlsx)</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={displayedDrivers.length === 0}
              className="bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 border border-slate-300 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
              title="Extract CSV data"
            >
              <FileCode className="w-4 h-4 text-blue-600" />
              <span>Extract CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl text-xs transition cursor-pointer shadow-sm"
              title="Print Audit Report"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              onClick={loadReport}
              disabled={loading}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl text-xs transition cursor-pointer shadow-sm"
              title="Refresh Audit Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Date Mode and Preset Filters */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Date Presets:
            </span>
            <button
              onClick={() => applyPreset('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                dateMode === 'single' && selectedDate === today
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => applyPreset('yesterday')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            >
              Yesterday
            </button>
            <button
              onClick={() => applyPreset('last7')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                dateMode === 'range' && dateTo === today && dateFrom !== today
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => applyPreset('last14')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            >
              Last 14 Days
            </button>
            <button
              onClick={() => applyPreset('this_month')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            >
              This Month
            </button>
          </div>

          {/* Single vs Range Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
            <button
              onClick={() => {
                setSelectedDate(dateFrom || selectedDate || today);
                setDateMode('single');
              }}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                dateMode === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'
              }`}
            >
              Single Date
            </button>
            <button
              onClick={() => {
                setDateFrom(selectedDate);
                setDateTo(selectedDate);
                setDateMode('range');
              }}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                dateMode === 'range' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'
              }`}
            >
              Date Range
            </button>
          </div>
        </div>

        {/* Detailed Filter Inputs Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* Date Picker Input */}
          {dateMode === 'single' ? (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Inspection Target Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          ) : (
            <div className="sm:col-span-2 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Date From
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Date To
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Depot Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
              <span>Depot Hub</span>
              {selectedDepot !== 'ALL' && (
                <button
                  onClick={() => setSelectedDepot('ALL')}
                  className="text-blue-600 hover:underline normal-case text-[10px]"
                >
                  Reset
                </button>
              )}
            </label>
            <div className="relative">
              <select
                value={selectedDepot}
                onChange={e => setSelectedDepot(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">All Depots (Complete Fleet)</option>
                {availableDepots.map(depot => (
                  <option key={depot} value={depot}>
                    Depot {depot}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Driver Search */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Search Driver / ID / Phone
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Name, SF7620, 7620, Phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Secondary Filters & View Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {/* Compliance Filter Toggle */}
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
              <button
                onClick={() => setFilterComplianceOnly('uninspected_only')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center space-x-1 ${
                  filterComplianceOnly === 'uninspected_only'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'hover:text-slate-900'
                }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Uninspected Drivers Only ({reportData?.summary.uninspectedDriversCount ?? 0})</span>
              </button>
              <button
                onClick={() => setFilterComplianceOnly('all')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center space-x-1 ${
                  filterComplianceOnly === 'all'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>All Active Drivers ({reportData?.summary.totalActiveDrivers ?? 0})</span>
              </button>
            </div>

            {/* Designation filter */}
            <select
              value={selectedDesignation}
              onChange={e => setSelectedDesignation(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Roles</option>
              <option value="SALESMAN">SALESMAN</option>
              <option value="SPV">SPV / Supervisor</option>
              <option value="DRIVER">DRIVER</option>
            </select>
          </div>

          {/* View Mode: Grouped Summary vs Daily Breakdown */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              onClick={() => setActiveViewMode('summary')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center space-x-1.5 ${
                activeViewMode === 'summary' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Grouped by Driver</span>
            </button>
            <button
              onClick={() => setActiveViewMode('daily_roster')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center space-x-1.5 ${
                activeViewMode === 'daily_roster' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Daily Missing Roster</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metrics Summary Strip */}
      {reportData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Drivers</span>
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Users className="w-4 h-4" />
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{reportData.summary.totalActiveDrivers}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Depot: {reportData.summary.depot} • {reportData.summary.totalDays} day(s) monitored
            </p>
          </div>

          <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-sm bg-rose-50/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Missing Inspection</span>
              <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
                <AlertTriangle className="w-4 h-4" />
              </span>
            </div>
            <p className="text-2xl font-black text-rose-700 mt-2">{reportData.summary.uninspectedDriversCount}</p>
            <p className="text-[11px] text-rose-600 mt-0.5 font-semibold">
              Drivers with non-compliant pre-trip status
            </p>
          </div>

          <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm bg-emerald-50/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Fully Compliant</span>
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
              </span>
            </div>
            <p className="text-2xl font-black text-emerald-700 mt-2">{reportData.summary.fullyCompliantCount}</p>
            <p className="text-[11px] text-emerald-600 mt-0.5">
              100% inspections submitted on time
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fleet Compliance</span>
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                <Clock className="w-4 h-4" />
              </span>
            </div>
            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-2xl font-black text-slate-900">{reportData.summary.overallComplianceRate}%</span>
              <span className="text-[11px] font-semibold text-slate-400">rate</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  reportData.summary.overallComplianceRate >= 80
                    ? 'bg-emerald-500'
                    : reportData.summary.overallComplianceRate >= 50
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${reportData.summary.overallComplianceRate}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Table / Content Section */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Table Header Bar */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-bold text-slate-900">
              {activeViewMode === 'summary'
                ? `Driver Non-Compliance Audit List (${displayedDrivers.length} drivers)`
                : `Daily Non-Compliance Roster (${reportData?.dailyRoster.length ?? 0} days)`}
            </h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
              {formatDisplayDate(fromDisplay)} {fromDisplay !== toDisplay ? `~ ${formatDisplayDate(toDisplay)}` : ''}
            </span>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            {filterComplianceOnly === 'uninspected_only' ? (
              <span className="text-rose-600 font-bold">Showing drivers with missing inspections only</span>
            ) : (
              <span>Showing all drivers with compliance audit status</span>
            )}
          </div>
        </div>

        {/* View Mode 1: Grouped Summary */}
        {activeViewMode === 'summary' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider select-none">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:bg-slate-200 transition"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Driver Details</span>
                      {sortField === 'name' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:bg-slate-200 transition"
                    onClick={() => handleSort('employeeId')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Emp ID / Login</span>
                      {sortField === 'employeeId' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:bg-slate-200 transition"
                    onClick={() => handleSort('depot')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Depot</span>
                      {sortField === 'depot' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Phone</th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:bg-slate-200 transition text-center"
                    onClick={() => handleSort('missedCount')}
                  >
                    <div className="flex items-center justify-center space-x-1">
                      <span>Missed Days</span>
                      {sortField === 'missedCount' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center">Compliance</th>
                  <th className="py-3 px-4 min-w-[220px]">Missing Inspection Dates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                      <span>Auditing driver records and cross-referencing pre-trip logs...</span>
                    </td>
                  </tr>
                ) : displayedDrivers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                      <p className="font-bold text-slate-700">No uninspected drivers found for this selection!</p>
                      <p className="text-xs text-slate-400 mt-1">
                        All monitored drivers have completed their mandatory pre-trip vehicle inspections.
                      </p>
                    </td>
                  </tr>
                ) : (
                  displayedDrivers.map((driver, idx) => {
                    const isUninspected = driver.missedCount > 0;
                    return (
                      <tr
                        key={driver.employeeId + driver.loginId}
                        className={`hover:bg-slate-50/80 transition ${
                          isUninspected ? 'bg-white' : 'bg-emerald-50/10'
                        }`}
                      >
                        <td className="py-3.5 px-4 text-center text-slate-400 font-semibold">{idx + 1}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-2.5">
                            <div>
                              <div className="font-bold text-slate-900">{driver.name}</div>
                              {driver.assignedVehicle && (
                                <div className="text-[10px] text-slate-400">
                                  Last Vehicle: <span className="font-semibold">{driver.assignedVehicle}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-slate-800">{driver.employeeId}</div>
                          <div className="text-[10px] font-mono text-slate-400">PIN: {driver.loginId}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-slate-100 text-slate-800 border border-slate-200">
                            {driver.depot}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              driver.designation.includes('SPV')
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {driver.designation}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {driver.phone ? (
                            <a
                              href={`tel:${driver.phone}`}
                              className="text-slate-600 hover:text-blue-600 flex items-center space-x-1"
                              title="Call driver"
                            >
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span className="font-mono text-[11px]">{driver.phone}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {driver.missedCount > 0 ? (
                            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-700 border border-rose-200">
                              {driver.missedCount} / {driver.totalDays}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                              0 Missed
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex flex-col items-center">
                            <span
                              className={`text-xs font-extrabold ${
                                driver.complianceRate === 100
                                  ? 'text-emerald-600'
                                  : driver.complianceRate >= 50
                                  ? 'text-amber-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {driver.complianceRate}%
                            </span>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider ${
                                driver.complianceStatus === 'Fully Compliant'
                                  ? 'text-emerald-500'
                                  : driver.complianceStatus === 'Partially Compliant'
                                  ? 'text-amber-500'
                                  : 'text-rose-500'
                              }`}
                            >
                              {driver.complianceStatus}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {driver.missedDates.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-md">
                              {driver.missedDates.slice(0, 6).map(dateStr => (
                                <span
                                  key={dateStr}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1"
                                  title={`Did not inspect on ${dateStr}`}
                                >
                                  <Clock className="w-2.5 h-2.5 text-rose-400" />
                                  <span>{formatDisplayDate(dateStr)}</span>
                                </span>
                              ))}
                              {driver.missedDates.length > 6 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                  +{driver.missedDates.length - 6} more
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-emerald-600 font-semibold text-[11px] flex items-center space-x-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Completed Daily Inspections</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* View Mode 2: Daily Missing Roster */}
        {activeViewMode === 'daily_roster' && (
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="py-12 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                <span>Generating daily compliance roster...</span>
              </div>
            ) : !reportData || reportData.dailyRoster.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <p>No daily data available for selected period.</p>
              </div>
            ) : (
              reportData.dailyRoster.map(dayItem => (
                <div key={dayItem.date} className="p-5 hover:bg-slate-50/50 transition">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center space-x-2.5">
                      <span className="p-2 rounded-xl bg-slate-100 text-slate-700 font-mono font-bold text-xs">
                        {dayItem.dayOfWeek}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{dayItem.formattedDate}</h4>
                        <span className="text-[11px] text-slate-400">Calendar Date: {dayItem.date}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span className="text-xs font-semibold text-slate-500">
                        Total Monitored: <strong className="text-slate-800">{dayItem.totalDrivers}</strong>
                      </span>
                      {dayItem.uninspectedCount > 0 ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200 flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>{dayItem.uninspectedCount} Drivers Missed Inspection</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>100% Inspected (All Compliant)</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {dayItem.missingDrivers.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2">
                      {dayItem.missingDrivers.map(drv => (
                        <div
                          key={drv.employeeId + dayItem.date}
                          className="bg-white border border-rose-100 rounded-xl p-3 shadow-xs flex items-center justify-between"
                        >
                          <div>
                            <div className="font-bold text-slate-900 text-xs">{drv.name}</div>
                            <div className="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
                              <span className="font-mono font-semibold text-slate-600">{drv.employeeId}</span>
                              <span>•</span>
                              <span className="font-semibold text-slate-600">Depot {drv.depot}</span>
                              <span>•</span>
                              <span>{drv.designation}</span>
                            </div>
                          </div>
                          {drv.phone && (
                            <a
                              href={`tel:${drv.phone}`}
                              className="p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition"
                              title={`Call ${drv.name} (${drv.phone})`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-600 font-semibold italic pt-1">
                      All drivers completed inspections for this day.
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
