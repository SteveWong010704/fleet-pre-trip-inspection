import React, { useState, useEffect, useMemo } from 'react';
import { InspectionRecord, InspectionPhoto } from '../../types';
import { fetchInspections, clearAllInspections } from '../../lib/api';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Calendar,
  Eye,
  MapPin,
  FileSpreadsheet,
  FileText,
  FileCode,
  Download,
  X,
  RefreshCw,
  Truck,
  RotateCcw,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Maximize2,
  Sliders,
  ShieldAlert,
  Check,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Camera,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { getCheckpointSystemChecks } from '../../lib/quickChecklistConfig';

export const InspectionHistory: React.FC = () => {
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Filter States (Supporting Multi-Select Condition)
  const [search, setSearch] = useState<string>('');
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<'branch' | 'route' | 'result' | null>(null);

  const [dateFilter, setDateFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [timeFrom, setTimeFrom] = useState<string>('');
  const [timeTo, setTimeTo] = useState<string>('');

  // Sorting State
  const [sortField, setSortField] = useState<'formattedDate' | 'vehicleNo' | 'vehicleBranch' | 'route' | 'driverName' | 'odometer' | 'overallResult'>('formattedDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination for bounded table view
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  
  const [activeRecord, setActiveRecord] = useState<InspectionRecord | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<InspectionPhoto | null>(null);

  const handlePhotoImgError = (e: React.SyntheticEvent<HTMLImageElement>, photoUrl?: string, itemCode?: number | string) => {
    const img = e.currentTarget;
    if (img.dataset.fallbackTried === '2') return;

    const attempts = Number(img.dataset.fallbackTried || 0);
    img.dataset.fallbackTried = String(attempts + 1);

    if (!activeRecord) return;
    const dateStr = activeRecord.timestamp ? activeRecord.timestamp.slice(0, 10) : '';
    const cleanPlate = (activeRecord.vehicleNo || '').trim().toUpperCase().replace(/[^a-zA-Z0-9]/g, '_');
    const baseName = (photoUrl || img.src).split('/').pop() || '';

    if (attempts === 0 && dateStr && cleanPlate && baseName) {
      img.src = `/api/backup/photos/${dateStr}/${cleanPlate}/${baseName}`;
    } else if (attempts === 1 && dateStr && baseName) {
      img.src = `/api/backup/photos/${dateStr}/${baseName}`;
    }
  };

  useEffect(() => {
    loadInspections();
  }, [selectedResults, selectedBranches, selectedRoutes, dateFilter, dateFrom, dateTo]);

  const loadInspections = async () => {
    setLoading(true);
    try {
      const list = await fetchInspections({
        result: selectedResults.length > 0 ? selectedResults.join(',') : 'ALL',
        branch: selectedBranches.length > 0 ? selectedBranches.join(',') : 'ALL',
        route: selectedRoutes.length > 0 ? selectedRoutes.join(',') : 'ALL',
        date: dateFilter,
        dateFrom: dateFrom,
        dateTo: dateTo,
      });
      setInspections(list);
    } catch (err) {
      console.error('Failed to load inspections:', err);
    } finally {
      setLoading(false);
    }
  };

  // Close open dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.multiselect-dropdown')) {
        setOpenDropdown(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Derive unique branches and routes for filter dropdowns
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    inspections.forEach(r => {
      if (r.vehicleBranch) set.add(r.vehicleBranch.trim().toUpperCase());
    });
    // Add common defaults if empty
    ['BL', 'KL', 'GB', 'KJ', 'NL', 'PN', 'JB'].forEach(b => set.add(b));
    return Array.from(set).sort();
  }, [inspections]);

  const availableRoutes = useMemo(() => {
    const set = new Set<string>();
    inspections.forEach(r => {
      if (r.route && r.route !== 'General Route' && !r.route.startsWith('Route-')) {
        set.add(r.route.trim().toUpperCase());
      }
    });
    // Default areas if empty
    if (set.size === 0) {
      ['BL01', 'BL02', 'KL01', 'KL02', 'GB01', 'KJ01'].forEach(rt => set.add(rt));
    }
    return Array.from(set).sort();
  }, [inspections]);

  // Client-side text search, time filtering, and dynamic column sorting
  const filteredAndSortedInspections = useMemo(() => {
    const filtered = inspections.filter(r => {
      // 1. Text search
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matches =
          r.id.toLowerCase().includes(q) ||
          r.vehicleNo.toLowerCase().includes(q) ||
          (r.driverName && r.driverName.toLowerCase().includes(q)) ||
          (r.driverId && r.driverId.toLowerCase().includes(q)) ||
          (r.vehicleBranch && r.vehicleBranch.toLowerCase().includes(q)) ||
          (r.route && r.route.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // 2. Strict Branch filter (Strictly match vehicle's branch)
      if (selectedBranches.length > 0 && !selectedBranches.includes('ALL')) {
        const vBranch = (r.vehicleBranch || '').trim().toUpperCase();
        const branchMatch = selectedBranches.some(b => b.trim().toUpperCase() === vBranch);
        if (!branchMatch) return false;
      }

      // 3. Route / Area filter
      if (selectedRoutes.length > 0 && !selectedRoutes.includes('ALL')) {
        const rRoute = (r.route || '').trim().toUpperCase();
        const routeMatch = selectedRoutes.some(rt => rRoute.includes(rt.trim().toUpperCase()) || rRoute === rt.trim().toUpperCase());
        if (!routeMatch) return false;
      }

      // 4. Result filter
      if (selectedResults.length > 0 && !selectedResults.includes('ALL')) {
        if (!selectedResults.includes(r.overallResult)) return false;
      }

      // 5. Time filter (e.g. 08:00 to 17:00)
      if (timeFrom || timeTo) {
        const dateObj = new Date(r.timestamp);
        if (!isNaN(dateObj.getTime())) {
          const hours = String(dateObj.getHours()).padStart(2, '0');
          const minutes = String(dateObj.getMinutes()).padStart(2, '0');
          const recordTime = `${hours}:${minutes}`;
          if (timeFrom && recordTime < timeFrom) return false;
          if (timeTo && recordTime > timeTo) return false;
        }
      }

      return true;
    });

    // Sort items
    filtered.sort((a, b) => {
      let valA: any = a[sortField] || '';
      let valB: any = b[sortField] || '';

      if (sortField === 'odometer') {
        valA = Number(a.odometer) || 0;
        valB = Number(b.odometer) || 0;
      } else if (sortField === 'formattedDate') {
        valA = new Date(a.timestamp).getTime();
        valB = new Date(b.timestamp).getTime();
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [inspections, search, timeFrom, timeTo, sortField, sortDirection]);

  // Alias for backward-compatible export and footer calculations
  const filteredInspections = filteredAndSortedInspections;

  // Paginated records for bounded scroll view
  const totalPages = Math.ceil(filteredAndSortedInspections.length / pageSize) || 1;
  const paginatedInspections = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedInspections.slice(start, start + pageSize);
  }, [filteredAndSortedInspections, currentPage, pageSize]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: typeof sortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-blue-600 font-bold" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-600 font-bold" />
    );
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedBranches([]);
    setSelectedRoutes([]);
    setSelectedResults([]);
    setDateFilter('');
    setDateFrom('');
    setDateTo('');
    setTimeFrom('');
    setTimeTo('');
    setOpenDropdown(null);
    setCurrentPage(1);
  };

  const toggleBranchSelection = (b: string) => {
    setSelectedBranches(prev =>
      prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]
    );
    setCurrentPage(1);
  };

  const toggleRouteSelection = (r: string) => {
    setSelectedRoutes(prev =>
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    );
    setCurrentPage(1);
  };

  const toggleResultSelection = (res: string) => {
    setSelectedResults(prev =>
      prev.includes(res) ? prev.filter(x => x !== res) : [...prev, res]
    );
    setCurrentPage(1);
  };

  const handleClearAllInspections = async () => {
    if (confirm('Are you sure you want to clear all inspection records? All vehicles will be reset to Pending Inspection.')) {
      await clearAllInspections();
      loadInspections();
    }
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredInspections.length === 0) {
      alert('No inspection records to export with the selected filters.');
      return;
    }

    const dataRows = filteredInspections.map((r, index) => ({
      'No.': index + 1,
      'Certificate ID': r.id,
      'Date & Time': r.formattedDate,
      'Vehicle Plate': r.vehicleNo,
      'Brand & Model': `${r.vehicleBrand || ''} ${r.vehicleModel || ''}`.trim(),
      'Branch / Depot': r.vehicleBranch || 'BL',
      'Route / Area': r.route || (r.vehicleBranch ? `${r.vehicleBranch}01` : 'BL01'),
      'Driver ID': r.driverId,
      'Driver Name': r.driverName,
      'Odometer (KM)': r.odometer,
      'Fuel Level (%)': `${r.fuelLevel}%`,
      'Overall Result': r.overallResult,
      'Defect Count': r.defectCount,
      'Defect Summary': r.defectSummary || (r.overallResult === 'Pass' ? 'None (10/10 Passed)' : 'Defects Reported'),
      'GPS Latitude': r.gpsLocation?.lat || 'N/A',
      'GPS Longitude': r.gpsLocation?.lng || 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    
    // Auto-fit column widths
    const columnWidths = [
      { wch: 6 },
      { wch: 22 },
      { wch: 20 },
      { wch: 14 },
      { wch: 22 },
      { wch: 15 },
      { wch: 22 },
      { wch: 12 },
      { wch: 26 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 35 },
      { wch: 14 },
      { wch: 14 },
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inspection Audit Logs');

    const timestamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Fleet_Inspection_Report_${timestamp}.xlsx`);
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredInspections.length === 0) {
      alert('No inspection records to export with the selected filters.');
      return;
    }

    const headers = [
      'No',
      'Certificate ID',
      'Date & Time',
      'Vehicle Plate',
      'Brand & Model',
      'Branch',
      'Route / Area',
      'Driver ID',
      'Driver Name',
      'Odometer KM',
      'Fuel Level %',
      'Result',
      'Defects',
      'Defect Details',
    ];

    const rows = filteredInspections.map((r, idx) => [
      idx + 1,
      `"${r.id}"`,
      `"${r.formattedDate}"`,
      `"${r.vehicleNo}"`,
      `"${(r.vehicleBrand || '') + ' ' + (r.vehicleModel || '')}"`,
      `"${r.vehicleBranch || 'BL'}"`,
      `"${r.route || (r.vehicleBranch ? `${r.vehicleBranch}01` : 'BL01')}"`,
      `"${r.driverId}"`,
      `"${r.driverName}"`,
      r.odometer,
      r.fuelLevel,
      `"${r.overallResult}"`,
      r.defectCount,
      `"${(r.defectSummary || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Fleet_Inspection_Audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF
  const handleExportPDF = () => {
    if (filteredInspections.length === 0) {
      alert('No inspection records to export with the selected filters.');
      return;
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'a4',
    });

    const passCount = filteredInspections.filter(r => r.overallResult === 'Pass').length;
    const failCount = filteredInspections.filter(r => r.overallResult === 'Fail').length;

    // Header banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 842, 60, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('FLEET PRE-TRIP INSPECTION AUDIT REPORT', 40, 36);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString('en-US')}`, 640, 36);

    // Filter Summary Sub-header
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORT FILTER PARAMETERS:', 40, 85);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const filterDesc = [
      `Branches: ${selectedBranches.length > 0 ? selectedBranches.join(', ') : 'All'}`,
      `Routes: ${selectedRoutes.length > 0 ? selectedRoutes.join(', ') : 'All'}`,
      `Results: ${selectedResults.length > 0 ? selectedResults.join(', ') : 'All'}`,
      dateFilter ? `Date: ${dateFilter}` : null,
      dateFrom ? `From: ${dateFrom}` : null,
      dateTo ? `To: ${dateTo}` : null,
      search ? `Search: "${search}"` : null,
    ].filter(Boolean).join('  |  ');
    doc.text(filterDesc, 40, 100);

    // Summary Metric boxes
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(40, 112, 170, 42, 6, 6, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL INSPECTED', 50, 126);
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(String(filteredInspections.length), 50, 145);

    doc.setFillColor(236, 253, 245);
    doc.roundedRect(220, 112, 170, 42, 6, 6, 'F');
    doc.setFontSize(8);
    doc.setTextColor(4, 120, 87);
    doc.text('PASSED (ROAD PERMIT ISSUED)', 230, 126);
    doc.setFontSize(14);
    doc.setTextColor(6, 95, 70);
    doc.setFont('helvetica', 'bold');
    doc.text(`${passCount} (${((passCount / filteredInspections.length) * 100).toFixed(1)}%)`, 230, 145);

    doc.setFillColor(255, 241, 242);
    doc.roundedRect(400, 112, 170, 42, 6, 6, 'F');
    doc.setFontSize(8);
    doc.setTextColor(190, 18, 60);
    doc.text('GROUNDED / DEFECTIVE', 410, 126);
    doc.setFontSize(14);
    doc.setTextColor(159, 18, 57);
    doc.setFont('helvetica', 'bold');
    doc.text(`${failCount} (${((failCount / filteredInspections.length) * 100).toFixed(1)}%)`, 410, 145);

    // Build Table Rows
    const tableBody = filteredInspections.map((r, i) => [
      i + 1,
      r.id,
      r.formattedDate,
      r.vehicleNo,
      r.vehicleBranch || 'BL',
      r.route || (r.vehicleBranch ? `${r.vehicleBranch}01` : 'BL01'),
      `${r.driverName}\n(${r.driverId})`,
      `${r.odometer.toLocaleString()} km`,
      `${r.fuelLevel}%`,
      r.overallResult,
      r.defectCount > 0 ? `${r.defectCount} Defect(s)\n${r.defectSummary || ''}` : 'All 10 Pass',
    ]);

    autoTable(doc, {
      startY: 168,
      head: [[
        '#',
        'Certificate ID',
        'Date & Time',
        'Vehicle Plate',
        'Branch',
        'Route (Area)',
        'Driver / ID',
        'Odometer',
        'Fuel',
        'Status',
        'Checklist & Defects',
      ]],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 65, 85],
        cellPadding: 4,
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 90, fontStyle: 'bold' },
        2: { cellWidth: 75 },
        3: { cellWidth: 60, fontStyle: 'bold' },
        4: { cellWidth: 45 },
        5: { cellWidth: 70 },
        6: { cellWidth: 100 },
        7: { cellWidth: 55 },
        8: { cellWidth: 35 },
        9: { cellWidth: 50, fontStyle: 'bold' },
        10: { cellWidth: 'auto' },
      },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 9) {
          if (data.cell.raw === 'Pass') {
            data.cell.styles.textColor = [5, 150, 105];
          } else if (data.cell.raw === 'Fail') {
            data.cell.styles.textColor = [225, 29, 72];
          }
        }
      },
      foot: [[
        { content: `Total Inspected: ${filteredInspections.length} | Official Compliance Audit Log`, colSpan: 11, styles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'italic' } }
      ]]
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    doc.save(`Fleet_Inspection_Audit_${timestamp}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Search Control Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-slate-800 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Inspection Audit Records & Export</h2>
            <p className="text-xs text-slate-500">Filter, search, and export vehicle inspection reports in PDF, Excel (.xlsx), or CSV.</p>
          </div>

          {/* Export Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportPDF}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
              title="Export filtered records to formatted PDF"
            >
              <FileText className="w-4 h-4 text-rose-400" />
              <span>Export PDF</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
              title="Export filtered records to Excel spreadsheet (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Excel (.xlsx)</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
              title="Export raw data to CSV file"
            >
              <FileCode className="w-4 h-4 text-blue-600" />
              <span>Export CSV</span>
            </button>

            {inspections.length > 0 && (
              <button
                onClick={handleClearAllInspections}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold px-3 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
                title="Clear all inspection records"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear All</span>
              </button>
            )}

            <button
              onClick={loadInspections}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl text-xs transition cursor-pointer shadow-sm"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Filter Controls Bar (Multi-Select Supported) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 pt-2 border-t border-slate-100 text-xs">
          {/* Multi-Select Branch Filter */}
          <div className="space-y-1 relative multiselect-dropdown">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Branch / Depot
            </label>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenDropdown(openDropdown === 'branch' ? null : 'branch');
              }}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 text-xs text-slate-800 px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between transition cursor-pointer"
            >
              <span className="truncate">
                {selectedBranches.length === 0
                  ? 'All Branches'
                  : selectedBranches.length === 1
                  ? selectedBranches[0]
                  : `${selectedBranches.length} Branches Selected`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1 flex-shrink-0" />
            </button>

            {openDropdown === 'branch' && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute z-30 top-full left-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 space-y-2 animate-fade-in"
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 text-[11px]">
                  <span className="font-bold text-slate-700">Select Branches</span>
                  <div className="space-x-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBranches([...availableBranches]);
                        setCurrentPage(1);
                      }}
                      className="text-blue-600 hover:underline font-semibold"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBranches([]);
                        setCurrentPage(1);
                      }}
                      className="text-slate-400 hover:underline font-semibold"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {availableBranches.map((b) => {
                    const checked = selectedBranches.includes(b);
                    return (
                      <label
                        key={b}
                        className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer select-none text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBranchSelection(b)}
                          className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 accent-blue-600 cursor-pointer"
                        />
                        <span className="font-medium text-slate-800 font-mono">{b}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Multi-Select Route / Area Filter */}
          <div className="space-y-1 relative multiselect-dropdown">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Route / Area
            </label>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenDropdown(openDropdown === 'route' ? null : 'route');
              }}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 text-xs text-slate-800 px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between transition cursor-pointer"
            >
              <span className="truncate">
                {selectedRoutes.length === 0
                  ? 'All Routes / Areas'
                  : selectedRoutes.length === 1
                  ? selectedRoutes[0]
                  : `${selectedRoutes.length} Areas Selected`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1 flex-shrink-0" />
            </button>

            {openDropdown === 'route' && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute z-30 top-full left-0 mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 space-y-2 animate-fade-in"
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 text-[11px]">
                  <span className="font-bold text-slate-700">Select Area / Route</span>
                  <div className="space-x-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRoutes([...availableRoutes]);
                        setCurrentPage(1);
                      }}
                      className="text-blue-600 hover:underline font-semibold"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRoutes([]);
                        setCurrentPage(1);
                      }}
                      className="text-slate-400 hover:underline font-semibold"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {availableRoutes.map((r) => {
                    const checked = selectedRoutes.includes(r);
                    return (
                      <label
                        key={r}
                        className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer select-none text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRouteSelection(r)}
                          className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 accent-blue-600 cursor-pointer"
                        />
                        <span className="font-medium text-slate-800 font-mono truncate">{r}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Multi-Select Result Filter */}
          <div className="space-y-1 relative multiselect-dropdown">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Result (Pass / Fail)
            </label>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenDropdown(openDropdown === 'result' ? null : 'result');
              }}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 text-xs text-slate-800 px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between transition cursor-pointer"
            >
              <span className="truncate">
                {selectedResults.length === 0
                  ? 'All Results'
                  : selectedResults.length === 1
                  ? selectedResults[0]
                  : 'Pass & Fail'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1 flex-shrink-0" />
            </button>

            {openDropdown === 'result' && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute z-30 top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 space-y-2 animate-fade-in"
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 text-[11px]">
                  <span className="font-bold text-slate-700">Select Result</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedResults([]);
                      setCurrentPage(1);
                    }}
                    className="text-slate-400 hover:underline font-semibold"
                  >
                    Clear
                  </button>
                </div>

                <div className="space-y-1">
                  {['Pass', 'Fail'].map((res) => {
                    const checked = selectedResults.includes(res);
                    return (
                      <label
                        key={res}
                        className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer select-none text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleResultSelection(res)}
                          className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 accent-blue-600 cursor-pointer"
                        />
                        <span className={`font-bold ${res === 'Pass' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {res === 'Pass' ? 'Pass (Cleared) 🟢' : 'Fail (Grounded) 🔴'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Date Range - From */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-300 text-xs text-slate-800 px-2.5 py-1.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          {/* Date Range - To */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              To Date
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-300 text-xs text-slate-800 px-2.5 py-1.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          {/* Time Range - From */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              From Time
            </label>
            <input
              type="time"
              value={timeFrom}
              onChange={(e) => {
                setTimeFrom(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-300 text-xs text-slate-800 px-2.5 py-1.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          {/* Time Range - To */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              To Time
            </label>
            <input
              type="time"
              value={timeTo}
              onChange={(e) => {
                setTimeTo(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-300 text-xs text-slate-800 px-2.5 py-1.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          {/* Search Bar */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Plate / Driver Search
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Filter Summary & Reset Bar */}
        {(selectedBranches.length > 0 || selectedRoutes.length > 0 || selectedResults.length > 0 || dateFrom || dateTo || timeFrom || timeTo || search) && (
          <div className="flex items-center justify-between bg-blue-50/80 border border-blue-200/80 px-3.5 py-2 rounded-xl text-xs text-blue-900">
            <div className="flex items-center space-x-2">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              <span>
                Active Filters applied: <strong>{filteredAndSortedInspections.length}</strong> matching records found.
              </span>
            </div>
            <button
              onClick={resetFilters}
              className="flex items-center space-x-1 text-blue-700 hover:text-blue-900 font-bold hover:underline cursor-pointer text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All Filters</span>
            </button>
          </div>
        )}

        {/* Inspections Data Table: Bounded vertical scroll max-h-[580px] with sticky header */}
        <div className="overflow-x-auto overflow-y-auto max-h-[580px] rounded-xl border border-slate-200 shadow-inner bg-white">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200 text-[11px] shadow-xs select-none">
              <tr>
                <th className="px-3.5 py-3">Certificate ID</th>
                <th
                  onClick={() => handleSort('vehicleNo')}
                  className="px-3.5 py-3 cursor-pointer hover:bg-slate-200/80 transition"
                  title="Click to sort by Vehicle Plate"
                >
                  <div className="flex items-center gap-1">
                    <span>Vehicle Plate</span>
                    {renderSortIcon('vehicleNo')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('vehicleBranch')}
                  className="px-3.5 py-3 cursor-pointer hover:bg-slate-200/80 transition"
                  title="Click to sort by Branch / Depot"
                >
                  <div className="flex items-center gap-1">
                    <span>Branch</span>
                    {renderSortIcon('vehicleBranch')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('route')}
                  className="px-3.5 py-3 cursor-pointer hover:bg-slate-200/80 transition"
                  title="Click to sort by Route / Area (e.g. BL01)"
                >
                  <div className="flex items-center gap-1">
                    <span>Route (Area)</span>
                    {renderSortIcon('route')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('driverName')}
                  className="px-3.5 py-3 cursor-pointer hover:bg-slate-200/80 transition"
                  title="Click to sort by Driver Name"
                >
                  <div className="flex items-center gap-1">
                    <span>Driver / Inspector</span>
                    {renderSortIcon('driverName')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('formattedDate')}
                  className="px-3.5 py-3 cursor-pointer hover:bg-slate-200/80 transition"
                  title="Click to sort by Date & Time"
                >
                  <div className="flex items-center gap-1">
                    <span>Date & Time</span>
                    {renderSortIcon('formattedDate')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('odometer')}
                  className="px-3.5 py-3 cursor-pointer hover:bg-slate-200/80 transition"
                  title="Click to sort by Odometer"
                >
                  <div className="flex items-center gap-1">
                    <span>Odometer & Fuel</span>
                    {renderSortIcon('odometer')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('overallResult')}
                  className="px-3.5 py-3 cursor-pointer hover:bg-slate-200/80 transition"
                  title="Click to sort by Inspection Status"
                >
                  <div className="flex items-center gap-1">
                    <span>Status</span>
                    {renderSortIcon('overallResult')}
                  </div>
                </th>
                <th className="px-3.5 py-3">Defects</th>
                <th className="px-3.5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                    <span>Loading inspection audit records...</span>
                  </td>
                </tr>
              ) : filteredAndSortedInspections.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Truck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <span>No inspection records match the current filter criteria.</span>
                  </td>
                </tr>
              ) : (
                paginatedInspections.map(r => {
                  const isPass = r.overallResult === 'Pass';
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-3.5 py-3 font-mono font-bold text-blue-600">
                        {r.id}
                      </td>
                      <td className="px-3.5 py-3">
                        <div className="font-mono font-bold text-slate-900">{r.vehicleNo}</div>
                        <div className="text-[10px] text-slate-400">{r.vehicleBrand} {r.vehicleModel}</div>
                      </td>
                      <td className="px-3.5 py-3">
                        <span className="inline-block bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded text-[10px] font-mono">
                          {r.vehicleBranch || 'BL'}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-slate-800 font-bold text-xs font-mono">
                        {r.route || (r.vehicleBranch ? `${r.vehicleBranch}01` : 'BL01')}
                      </td>
                      <td className="px-3.5 py-3">
                        <div className="font-semibold text-slate-800">{r.driverName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {r.driverId}</div>
                      </td>
                      <td className="px-3.5 py-3 text-slate-600 font-mono text-[11px]">
                        {r.formattedDate}
                      </td>
                      <td className="px-3.5 py-3 font-mono">
                        <div className="font-medium text-slate-800">{r.odometer.toLocaleString()} KM</div>
                        <div className="text-[10px] text-blue-600 font-semibold">{r.fuelLevel}% Fuel</div>
                      </td>
                      <td className="px-3.5 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                          isPass
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {isPass ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-rose-600" />}
                          {r.overallResult}
                        </span>
                      </td>
                      <td className="px-3.5 py-3">
                        {r.defectCount > 0 ? (
                          <span className="text-rose-600 font-semibold text-xs">
                            {r.defectCount} Defect(s)
                          </span>
                        ) : (
                          <span className="text-emerald-600 text-xs font-semibold">10/10 All Pass</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setActiveRecord(r)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 transition cursor-pointer shadow-sm"
                          title="View Full Inspection Audit"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar for Bounded Viewport */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-2 border-t border-slate-100">
          <div className="flex items-center space-x-2">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
            <span>records per page</span>
            <span className="text-slate-300">|</span>
            <span>
              Showing{' '}
              <strong>
                {filteredInspections.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} -{' '}
                {Math.min(currentPage * pageSize, filteredInspections.length)}
              </strong>{' '}
              of <strong>{filteredInspections.length}</strong>
            </span>
          </div>

          {totalPages > 1 && (
            <div className="inline-flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer font-medium"
              >
                Prev
              </button>
              <span className="px-2 font-mono text-slate-600">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer font-medium"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Detail Inspection View - Organized Dossier for Fleet Admin */}
      {activeRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full p-4 sm:p-6 space-y-5 shadow-2xl text-slate-800 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <span className="font-mono font-black text-blue-600 text-lg">{activeRecord.id}</span>
                <span
                  className={`px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    activeRecord.overallResult === 'Pass'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {activeRecord.overallResult === 'Pass' ? '✓ Passed Inspection' : '⚠ Failed Inspection'}
                </span>
                <span className="text-xs text-slate-400 hidden sm:inline">
                  • {activeRecord.photos?.length || 0} Photos Recorded
                </span>
              </div>
              <button
                onClick={() => setActiveRecord(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1.5 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Top Quick Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] font-bold tracking-wider uppercase">VEHICLE PLATE</span>
                <div className="font-mono font-black text-slate-900 text-sm mt-0.5">{activeRecord.vehicleNo}</div>
                <div className="text-[11px] text-slate-500 font-medium">
                  {activeRecord.vehicleBrand} {activeRecord.vehicleModel}
                </div>
                <div className="mt-1">
                  <span
                    className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${
                      activeRecord.truckCategory === 'Feeder' ||
                      String(activeRecord.vehicleModel || '').toLowerCase().includes('feeder')
                        ? 'bg-purple-50 text-purple-800 border-purple-200'
                        : 'bg-blue-50 text-blue-800 border-blue-200'
                    }`}
                  >
                    {activeRecord.truckCategory === 'Feeder' ||
                    String(activeRecord.vehicleModel || '').toLowerCase().includes('feeder')
                      ? 'Feeder (Big Truck)'
                      : 'Small Truck'}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-bold tracking-wider uppercase">ASSIGNED DRIVER</span>
                <div className="font-bold text-slate-900 text-xs mt-0.5">{activeRecord.driverName}</div>
                <div className="text-[11px] text-slate-500 font-mono">ID: {activeRecord.driverId}</div>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-bold tracking-wider uppercase">ODOMETER & FUEL</span>
                <div className="font-mono font-bold text-slate-900 text-xs mt-0.5">
                  {activeRecord.odometer?.toLocaleString()} km
                </div>
                <div className="text-[11px] text-slate-500 font-medium">Fuel Tank: {activeRecord.fuelLevel}%</div>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-bold tracking-wider uppercase">TIMESTAMP & AREA</span>
                <div className="text-slate-900 font-medium text-xs mt-0.5">{activeRecord.formattedDate}</div>
                <div className="text-[11px] text-slate-600 font-medium">Branch: <strong className="text-slate-800">{activeRecord.vehicleBranch || 'BL'}</strong></div>
                <div className="text-[11px] text-blue-700 font-bold font-mono">Route / Area: {activeRecord.route || (activeRecord.vehicleBranch ? `${activeRecord.vehicleBranch}01` : 'BL01')}</div>
              </div>
            </div>

            {/* GPS & Physical Location Banner */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-start space-x-2.5">
                <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                    <span>Physical Inspection Location:</span>
                    <span className="text-blue-800 font-extrabold bg-blue-100/70 px-2 py-0.5 rounded">
                      {activeRecord.gpsLocation?.address || 'Verified Depot Inspection Station'}
                    </span>
                  </div>
                  {activeRecord.gpsLocation && (
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Coordinates: {activeRecord.gpsLocation.lat.toFixed(5)}°N, {activeRecord.gpsLocation.lng.toFixed(5)}°E
                    </div>
                  )}
                </div>
              </div>

              {activeRecord.gpsLocation && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${activeRecord.gpsLocation.lat},${activeRecord.gpsLocation.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-blue-700 hover:text-blue-900 bg-white border border-blue-200 px-3 py-1.5 rounded-lg shadow-xs flex items-center gap-1.5 self-start sm:self-auto transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>View on Google Maps</span>
                </a>
              )}
            </div>

            {/* DEFECT ALERT BANNER (If any Fail items exist) */}
            {activeRecord.items?.some((i) => i.status === 'Fail') && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-xs uppercase tracking-wider">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Defects Reported by Driver ({activeRecord.items.filter((i) => i.status === 'Fail').length} Items Failed)</span>
                </div>
                <div className="space-y-1.5">
                  {activeRecord.items
                    .filter((i) => i.status === 'Fail')
                    .map((def) => (
                      <div
                        key={def.id}
                        className="bg-white p-2.5 rounded-xl border border-rose-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-2xs"
                      >
                        <span className="font-bold text-slate-800">
                          #{def.code}. {def.title}:
                        </span>
                        <span className="text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                          Remark: {def.defectNote || 'No remark provided'}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* SECTION 1: TIRES & WHEELS (5 PHOTOS ORGANIZED GRID) */}
            {(() => {
              const tireItem = activeRecord.items?.find((i) => i.id === 'tires_wheels');
              const tirePhotos = activeRecord.photos?.filter((p) => p.itemId === 'tires_wheels') || [];
              const tireSlots = [
                { index: 0, name: 'Front-Left Tyre', label: 'Front-L' },
                { index: 1, name: 'Front-Right Tyre', label: 'Front-R' },
                { index: 2, name: 'Rear-Left Tyre', label: 'Rear-L' },
                { index: 3, name: 'Rear-Right Tyre', label: 'Rear-R' },
                { index: 4, name: 'Spare Tyre', label: 'Spare' },
              ];

              return (
                <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center font-mono">
                        1
                      </span>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                        Tires & Wheels (5-Point Inspection: 4 Road Tyres + 1 Spare)
                      </h4>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                        tireItem?.status === 'Pass'
                          ? 'bg-emerald-100 text-emerald-800'
                          : tireItem?.status === 'Fail'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {tireItem?.status || 'Pass'}
                    </span>
                  </div>

                  {tireItem?.defectNote && (
                    <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl font-medium">
                      Defect Note: {tireItem.defectNote}
                    </div>
                  )}

                  {/* 5-Column Clean Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                    {tireSlots.map((slot) => {
                      const photo =
                        tirePhotos.find((p) => p.slotIndex === slot.index || p.slotName === slot.name) ||
                        tirePhotos[slot.index];

                      return (
                        <div
                          key={slot.index}
                          className={`rounded-xl border p-2 space-y-1.5 flex flex-col justify-between text-xs transition ${
                            photo ? 'bg-slate-50 border-slate-200' : 'bg-slate-50/50 border-dashed border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[11px] text-slate-800 truncate" title={slot.name}>
                              {slot.name}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 bg-white border border-slate-200 px-1 rounded">
                              {slot.label}
                            </span>
                          </div>

                          {photo ? (
                            <div
                              onClick={() => setPreviewPhoto(photo)}
                              className="relative group cursor-pointer rounded-lg overflow-hidden border border-slate-200"
                            >
                              <img
                                src={photo.url}
                                alt={slot.name}
                                className="w-full h-24 object-cover"
                                onError={(e) => handlePhotoImgError(e, photo.url, 1)}
                              />
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                <Maximize2 className="w-5 h-5 drop-shadow" />
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-24 rounded-lg bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400 text-[10px] font-medium text-center p-2">
                              <span>No Photo</span>
                            </div>
                          )}

                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            {photo ? '✓ Watermarked' : 'Missing'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* SECTION 2: CARGO & BODY (4 SIDES WALKAROUND) */}
            {(() => {
              const bodyItem = activeRecord.items?.find((i) => i.id === 'body_passenger_doors');
              const bodyPhotos = activeRecord.photos?.filter((p) => p.itemId === 'body_passenger_doors') || [];
              const bodySlots = [
                { index: 0, name: 'Front View', label: 'Front' },
                { index: 1, name: 'Rear View', label: 'Rear' },
                { index: 2, name: 'Left Side View', label: 'Left' },
                { index: 3, name: 'Right Side View', label: 'Right' },
              ];

              return (
                <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center font-mono">
                        8
                      </span>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                        Cargo & Body (4-Sides Walkaround)
                      </h4>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                        bodyItem?.status === 'Pass'
                          ? 'bg-emerald-100 text-emerald-800'
                          : bodyItem?.status === 'Fail'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {bodyItem?.status || 'Pass'}
                    </span>
                  </div>

                  {bodyItem?.defectNote && (
                    <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl font-medium">
                      Defect Note: {bodyItem.defectNote}
                    </div>
                  )}

                  {/* 4-Column Clean Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {bodySlots.map((slot) => {
                      const photo =
                        bodyPhotos.find((p) => p.slotIndex === slot.index || p.slotName === slot.name) ||
                        bodyPhotos[slot.index];

                      return (
                        <div
                          key={slot.index}
                          className={`rounded-xl border p-2 space-y-1.5 flex flex-col justify-between text-xs transition ${
                            photo ? 'bg-slate-50 border-slate-200' : 'bg-slate-50/50 border-dashed border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[11px] text-slate-800 truncate" title={slot.name}>
                              {slot.name}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 bg-white border border-slate-200 px-1 rounded">
                              {slot.label}
                            </span>
                          </div>

                          {photo ? (
                            <div
                              onClick={() => setPreviewPhoto(photo)}
                              className="relative group cursor-pointer rounded-lg overflow-hidden border border-slate-200"
                            >
                              <img
                                src={photo.url}
                                alt={slot.name}
                                className="w-full h-24 object-cover"
                                onError={(e) => handlePhotoImgError(e, photo.url, 8)}
                              />
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                <Maximize2 className="w-5 h-5 drop-shadow" />
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-24 rounded-lg bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400 text-[10px] font-medium text-center p-2">
                              <span>No Photo</span>
                            </div>
                          )}

                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            {photo ? '✓ Watermarked' : 'Missing'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* SECTION 3: DASHBOARD & WARNINGS (CLUSTER PHOTO + CONFIRMED INDICATOR STATUS) */}
            {(() => {
              const dashItem = activeRecord.items?.find((i) => i.id === 'dashboard_warnings');
              const dashPhoto = activeRecord.photos?.find((p) => p.itemId === 'dashboard_warnings');
              const checks = dashItem?.dashboardChecks;

              return (
                <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center font-mono">
                        6
                      </span>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                        Dashboard & Instrument Warnings
                      </h4>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                        dashItem?.status === 'Pass'
                          ? 'bg-emerald-100 text-emerald-800'
                          : dashItem?.status === 'Fail'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {dashItem?.status || 'Pass'}
                    </span>
                  </div>

                  {dashItem?.defectNote && (
                    <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl font-medium">
                      Defect Note: {dashItem.defectNote}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    {/* Left: Cluster Photo */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-600 block">Instrument Cluster Photo:</span>
                      {dashPhoto ? (
                        <div
                          onClick={() => setPreviewPhoto(dashPhoto)}
                          className="relative group cursor-pointer rounded-xl overflow-hidden border border-slate-200 h-32"
                        >
                          <img
                            src={dashPhoto.url}
                            alt="Cluster"
                            className="w-full h-full object-cover"
                            onError={(e) => handlePhotoImgError(e, dashPhoto.url, 6)}
                          />
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                            <Maximize2 className="w-5 h-5 drop-shadow" />
                          </div>
                        </div>
                      ) : (
                        <div className="h-32 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-xs text-slate-400">
                          No Cluster Photo
                        </div>
                      )}
                    </div>

                    {/* Right: Confirmed Indicator Status Ticks */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-600 block">
                        Driver Confirmed Cluster Indicators:
                      </span>
                      <div className="grid grid-cols-1 gap-1.5 text-xs">
                        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                          <span className="text-slate-700 font-medium">Engine Check Warning Lamp:</span>
                          <span
                            className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                              checks?.engineLightOff ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {checks?.engineLightOff ? '✓ OFF (Normal)' : 'Unconfirmed'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                          <span className="text-slate-700 font-medium">Double Signal / Hazard Flashers:</span>
                          <span
                            className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                              checks?.doubleSignalOk ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {checks?.doubleSignalOk ? '✓ Working' : 'Unconfirmed'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                          <span className="text-slate-700 font-medium">Battery Charging Lamp:</span>
                          <span
                            className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                              checks?.batteryLightOff ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {checks?.batteryLightOff ? '✓ OFF (Normal)' : 'Unconfirmed'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                          <span className="text-slate-700 font-medium">Engine Oil Pressure Lamp:</span>
                          <span
                            className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                              checks?.oilLightOff ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {checks?.oilLightOff ? '✓ OFF (Normal)' : 'Unconfirmed'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* SECTION 4: ENGINE & FUEL (RADIATOR & DIESEL CAP) */}
            {(() => {
              const radItem = activeRecord.items?.find((i) => i.id === 'radiator_coolant');
              const radPhoto = activeRecord.photos?.find((p) => p.itemId === 'radiator_coolant');
              const capItem = activeRecord.items?.find((i) => i.id === 'diesel_fuel_cap');
              const capPhoto = activeRecord.photos?.find((p) => p.itemId === 'diesel_fuel_cap');

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Radiator */}
                  <div className="border border-slate-200 rounded-2xl p-4 space-y-2.5 bg-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center font-mono">
                          5
                        </span>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                          Radiator & Coolant Level
                        </h4>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          radItem?.status === 'Pass'
                            ? 'bg-emerald-100 text-emerald-800'
                            : radItem?.status === 'Fail'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {radItem?.status || 'Pass'}
                      </span>
                    </div>

                    {radPhoto && (
                      <div
                        onClick={() => setPreviewPhoto(radPhoto)}
                        className="relative group cursor-pointer rounded-xl overflow-hidden border border-slate-200 h-28"
                      >
                        <img
                          src={radPhoto.url}
                          alt="Radiator"
                          className="w-full h-full object-cover"
                          onError={(e) => handlePhotoImgError(e, radPhoto.url, 5)}
                        />
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                          <Maximize2 className="w-5 h-5 drop-shadow" />
                        </div>
                      </div>
                    )}

                    {radItem?.defectNote && (
                      <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded-lg font-medium">
                        Remark: {radItem.defectNote}
                      </div>
                    )}
                  </div>

                  {/* Diesel Cap */}
                  <div className="border border-slate-200 rounded-2xl p-4 space-y-2.5 bg-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center font-mono">
                          9
                        </span>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                          Diesel Fuel Tank & Cap
                        </h4>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          capItem?.status === 'Pass'
                            ? 'bg-emerald-100 text-emerald-800'
                            : capItem?.status === 'Fail'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {capItem?.status || 'Pass'}
                      </span>
                    </div>

                    {capPhoto && (
                      <div
                        onClick={() => setPreviewPhoto(capPhoto)}
                        className="relative group cursor-pointer rounded-xl overflow-hidden border border-slate-200 h-28"
                      >
                        <img
                          src={capPhoto.url}
                          alt="Diesel Cap"
                          className="w-full h-full object-cover"
                          onError={(e) => handlePhotoImgError(e, capPhoto.url, 9)}
                        />
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                          <Maximize2 className="w-5 h-5 drop-shadow" />
                        </div>
                      </div>
                    )}

                    {capItem?.defectNote && (
                      <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded-lg font-medium">
                        Remark: {capItem.defectNote}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* SECTION 5: OTHER SAFETY & MECHANICAL CHECKPOINTS */}
            {(() => {
              const otherIds = [
                'lights_indicators',
                'emergency_equipment',
                'brake_system',
                'steering_handling',
                'fluids_powertrain',
              ];
              const otherItems = activeRecord.items?.filter((i) => otherIds.includes(i.id)) || [];
              const isFeeder =
                activeRecord.truckCategory === 'Feeder' ||
                String(activeRecord.vehicleModel || '').toLowerCase().includes('feeder');

              return (
                <div className="border border-slate-200 rounded-2xl p-4 space-y-3.5 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 pb-2">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                        Other Safety, Electrical & APAD Statutory Checkpoints
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Operational lights, required emergency onboard safety equipment, braking, and steering controls
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {otherItems.map((item) => {
                      const photo = activeRecord.photos?.find((p) => p.itemId === item.id);
                      const isProminentCheck = item.id === 'lights_indicators' || item.id === 'emergency_equipment';

                      // Resolve all statutory verification checks
                      const configChecks = getCheckpointSystemChecks(item.id, isFeeder);
                      const recordedChecks = item.systemChecks || {};

                      const resolvedChecks: { key: string; label: string; checked: boolean }[] = [];

                      if (configChecks.length > 0) {
                        configChecks.forEach((chk) => {
                          let isChecked = true;
                          if (recordedChecks[chk.key] !== undefined) {
                            isChecked = Boolean(recordedChecks[chk.key]);
                          } else if (item.status === 'Fail') {
                            const note = (item.defectNote || '').toLowerCase();
                            const keyMatch = note.includes(chk.key.toLowerCase().replace(/_/g, ' '));
                            const labelMatch = note.includes(chk.label.toLowerCase());
                            isChecked = !(keyMatch || labelMatch);
                          } else {
                            // If checkpoint passed, all statutory checks were verified and passed
                            isChecked = true;
                          }
                          resolvedChecks.push({
                            key: chk.key,
                            label: chk.label,
                            checked: isChecked,
                          });
                        });

                        // Include any extra custom checks stored on the record
                        Object.entries(recordedChecks).forEach(([k, v]) => {
                          if (!configChecks.some((c) => c.key === k)) {
                            resolvedChecks.push({
                              key: k,
                              label: k.replace(/_/g, ' '),
                              checked: Boolean(v),
                            });
                          }
                        });
                      } else if (Object.keys(recordedChecks).length > 0) {
                        Object.entries(recordedChecks).forEach(([k, v]) => {
                          resolvedChecks.push({
                            key: k,
                            label: k.replace(/_/g, ' '),
                            checked: Boolean(v),
                          });
                        });
                      }

                      const totalChecks = resolvedChecks.length;
                      const passedCount = resolvedChecks.filter((c) => c.checked).length;

                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl border border-slate-200 flex flex-col justify-between text-xs space-y-2.5 transition ${
                            isProminentCheck
                              ? 'md:col-span-2 bg-gradient-to-r from-blue-50/40 via-white to-slate-50/50 border-blue-200/80 shadow-2xs'
                              : 'bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-800 font-bold text-[10px] flex items-center justify-center font-mono">
                                {item.code}
                              </span>
                              <span className="font-bold text-slate-900 text-xs truncate">
                                {item.title}
                              </span>
                              {item.id === 'emergency_equipment' && (
                                <span className="text-[9px] font-bold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded">
                                  {isFeeder ? 'APAD Feeder Spec' : 'Commercial Vehicle Spec'}
                                </span>
                              )}
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                item.status === 'Pass'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.status === 'Fail'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>

                          {photo && (
                            <div
                              onClick={() => setPreviewPhoto(photo)}
                              className="relative group cursor-pointer rounded-lg overflow-hidden border border-slate-200 h-24"
                            >
                              <img
                                src={photo.url}
                                alt={item.title}
                                className="w-full h-full object-cover"
                                onError={(e) => handlePhotoImgError(e, photo.url, item.code)}
                              />
                              <div className="absolute top-1 left-1 bg-slate-900/75 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded max-w-[90%] truncate">
                                {photo.slotName || 'Verification Photo'}
                              </div>
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                <Maximize2 className="w-4 h-4" />
                              </div>
                            </div>
                          )}

                          {totalChecks > 0 && (
                            <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1.5 shadow-2xs">
                              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                                <span className="text-slate-600">
                                  Ticked / Verified Items:
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-extrabold ${
                                    passedCount === totalChecks
                                      ? 'text-emerald-800 bg-emerald-50 border border-emerald-200'
                                      : 'text-rose-800 bg-rose-50 border border-rose-200'
                                  }`}
                                >
                                  {passedCount}/{totalChecks} Verified OK
                                </span>
                              </div>
                              <div className={`grid gap-1.5 ${isProminentCheck ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                                {resolvedChecks.map((chk) => (
                                  <div
                                    key={chk.key}
                                    className={`px-2 py-1 rounded-md text-[10px] font-medium flex items-center gap-1.5 border ${
                                      chk.checked
                                        ? 'bg-emerald-50/70 text-emerald-800 border-emerald-200'
                                        : 'bg-rose-50/70 text-rose-800 border-rose-200 line-through'
                                    }`}
                                  >
                                    <span className="font-black text-[11px] shrink-0">
                                      {chk.checked ? '✓' : '✗'}
                                    </span>
                                    <span className="truncate">{chk.label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {item.defectNote && (
                            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded font-medium">
                              Defect Remark: {item.defectNote}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* PHOTO LIGHTBOX MODAL (Click to Enlarge Any Photo with Watermark Details) */}
      {previewPhoto && (
        <div className="fixed inset-0 z-60 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
          <div className="max-w-3xl w-full bg-slate-900 rounded-3xl overflow-hidden border border-slate-700 shadow-2xl space-y-3 p-4">
            <div className="flex items-center justify-between text-white border-b border-slate-800 pb-2.5">
              <div>
                <h4 className="font-bold text-sm text-slate-100">
                  {previewPhoto.itemTitle || 'Evidence Photo'}
                  {previewPhoto.slotName && (
                    <span className="text-blue-400 font-bold ml-1.5">({previewPhoto.slotName})</span>
                  )}
                </h4>
                <div className="text-[11px] text-slate-400 font-mono">
                  {previewPhoto.timestamp ? new Date(previewPhoto.timestamp).toLocaleString() : ''}
                </div>
              </div>
              <button
                onClick={() => setPreviewPhoto(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-black flex items-center justify-center max-h-[70vh]">
              <img
                src={previewPhoto.url}
                alt={previewPhoto.itemTitle || 'Inspection Photo'}
                className="max-w-full max-h-[70vh] object-contain rounded-xl"
                onError={(e) => handlePhotoImgError(e, previewPhoto.url)}
              />
            </div>

            {previewPhoto.gps && (
              <div className="text-xs text-blue-300 font-mono flex items-center justify-between bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                  <span>GPS: {typeof previewPhoto.gps.lat === 'number' ? previewPhoto.gps.lat.toFixed(5) : previewPhoto.gps.lat}°N, {typeof previewPhoto.gps.lng === 'number' ? previewPhoto.gps.lng.toFixed(5) : previewPhoto.gps.lng}°E</span>
                </span>
                <span className="text-[10px] text-slate-400">{previewPhoto.caption || 'Inspection Stamped'}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
