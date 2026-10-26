import React, { useState, useEffect, useMemo } from 'react';
import {
  DriverQaReportResult,
  DriverQaPatternSummary,
  DepotQaPatternGroup,
  DriverMistakeItem,
  DepotItem,
} from '../../types';
import {
  fetchDriverQaPatternReportApi,
  seedSampleDriverQaAuditsApi,
  fetchDepots,
} from '../../lib/api';
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Camera,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Download,
  FileSpreadsheet,
  FileText,
  Calendar,
  Filter,
  Search,
  RefreshCw,
  Eye,
  X,
  User,
  Building2,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Maximize2,
  Check,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const DriverQaPatternReport: React.FC = () => {
  const [report, setReport] = useState<DriverQaReportResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [seedSuccessMsg, setSeedSuccessMsg] = useState<string>('');
  const [masterDepots, setMasterDepots] = useState<DepotItem[]>([]);

  // Filter States
  const [selectedDepot, setSelectedDepot] = useState<string>('ALL');
  const [driverSearch, setDriverSearch] = useState<string>('');
  // Default to empty strings so all historical and today's audits load immediately without date clipping
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showOnlyMistakes, setShowOnlyMistakes] = useState<boolean>(false);

  // Drilldown Modal
  const [selectedDriverForDrilldown, setSelectedDriverForDrilldown] = useState<DriverQaPatternSummary | null>(null);
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);

  // Load Master Depots from route/region/depo master data
  useEffect(() => {
    fetchDepots()
      .then((data) => {
        if (Array.isArray(data)) {
          setMasterDepots(data);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch master depots:', err);
      });
  }, []);

  // Compute available depot codes strictly matching pure code format (e.g. BL, KL)
  const availableDepotCodes = useMemo(() => {
    const set = new Set<string>();
    masterDepots.forEach((d) => {
      if (d.code) set.add(d.code.trim().toUpperCase());
    });
    if (report?.depotGroups) {
      report.depotGroups.forEach((g) => {
        if (g.depotCode) set.add(g.depotCode.trim().toUpperCase());
      });
    }
    // Baseline fallback from route/region/depo master list
    if (set.size === 0) {
      ['BL', 'KL', 'AG', 'KJ', 'SL', 'PN', 'JB', 'IP', 'SB', 'MN', 'NL', 'PG', 'GB', 'TI', 'TP', 'LN', 'SP', 'AS', 'LW'].forEach((c) => set.add(c));
    }
    return Array.from(set).sort();
  }, [masterDepots, report]);

  const getMalaysiaDateStr = (date: Date = new Date()) => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  };

  const loadReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchDriverQaPatternReportApi({
        dateFrom,
        dateTo,
        depot: selectedDepot,
        driverId: driverSearch.trim() || undefined,
      });
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load driver QA pattern report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [dateFrom, dateTo, selectedDepot]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadReport();
  };

  // Preset Date Handlers with Malaysia timezone accuracy
  const handleSetPreset = (preset: 'today' | '7days' | '30days' | 'month' | 'all') => {
    const todayStr = getMalaysiaDateStr();

    if (preset === 'today') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setDateFrom(getMalaysiaDateStr(d));
      setDateTo(todayStr);
    } else if (preset === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setDateFrom(getMalaysiaDateStr(d));
      setDateTo(todayStr);
    } else if (preset === 'month') {
      setDateFrom(`${todayStr.slice(0, 7)}-01`);
      setDateTo(todayStr);
    } else if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    }
  };

  const handleSeedSampleData = async () => {
    try {
      setIsSeeding(true);
      setSeedSuccessMsg('');
      const res = await seedSampleDriverQaAuditsApi();
      setSeedSuccessMsg(`Successfully seeded ${res.auditedPhotosCount} sample QA audits across ${res.seededInspections} inspections!`);
      await loadReport();
      setTimeout(() => setSeedSuccessMsg(''), 6000);
    } catch (err: any) {
      alert(`Error seeding sample data: ${err.message}`);
    } finally {
      setIsSeeding(false);
    }
  };

  // Filtered Depot Groups based on search term & mistakes toggle
  const filteredDepotGroups = useMemo(() => {
    if (!report?.depotGroups) return [];
    const term = driverSearch.toLowerCase().trim();

    return report.depotGroups
      .map(depot => {
        let matchingDrivers = depot.drivers;
        if (term) {
          matchingDrivers = matchingDrivers.filter(d =>
            d.driverName.toLowerCase().includes(term) ||
            d.driverId.toLowerCase().includes(term) ||
            d.identifiedPatterns.some(p => p.toLowerCase().includes(term))
          );
        }
        if (showOnlyMistakes) {
          matchingDrivers = matchingDrivers.filter(d => d.mistakes.length > 0 || d.overallQualityScore < 100);
        }
        return {
          ...depot,
          drivers: matchingDrivers,
        };
      })
      .filter(depot => depot.drivers.length > 0);
  }, [report, driverSearch, showOnlyMistakes]);

  // Export to Excel
  const handleExportExcel = () => {
    if (!report || report.depotGroups.length === 0) {
      alert('No QA audit data to export for the selected date range.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // 1. Summary Sheet
    const summaryData: any[] = [];
    filteredDepotGroups.forEach(group => {
      group.drivers.forEach(driver => {
        const inspectionsList = driver.inspections && driver.inspections.length > 0
          ? driver.inspections.map(i => `${i.id} (${i.formattedDate})`).join('; ')
          : '-';

        summaryData.push({
          Depot: group.depotCode,
          'Driver ID': driver.driverId,
          'Driver Name': driver.driverName,
          'Inspections Carried Out (ID & Date)': inspectionsList,
          'Total Inspections': driver.totalInspections,
          'Audited Photos': driver.totalPhotosAudited,
          'Correct Photos': driver.correctPhotosCount,
          'Wrong Part Photos': driver.wrongPartCount,
          'Bad Position / Angle Photos': driver.wrongPositionCount,
          'Accurate Assessments': driver.accurateAssessmentsCount,
          'False Positives (Part OK)': driver.falsePositivesCount,
          'False Negatives (Missed Defects)': driver.falseNegativesCount,
          'Photo Validity Rate (%)': `${driver.photoValidityRate}%`,
          'Assessment Accuracy (%)': `${driver.assessmentAccuracyRate}%`,
          'Overall Quality Score (%)': `${driver.overallQualityScore}%`,
          'Identified Mistake Patterns': driver.identifiedPatterns.join('; '),
        });
      });
    });

    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Driver QA Summary');

    // 2. Detailed Mistakes Sheet
    const allMistakes: any[] = [];
    filteredDepotGroups.forEach(group => {
      group.drivers.forEach(driver => {
        driver.mistakes.forEach(m => {
          allMistakes.push({
            'Inspection ID': m.inspectionId,
            'Date Carried Out': m.formattedDate || m.timestamp,
            Depot: m.driverDepot,
            'Driver ID': m.driverId,
            'Driver Name': m.driverName,
            'Vehicle Plate': m.vehicleNo,
            'Spare Part / Item': m.itemTitle,
            'Driver Reported Claim': m.driverClaimStatus,
            'Photo Quality Finding': m.photoQuality === 'wrong_part' ? 'Wrong Spare Part Photographed' : m.photoQuality === 'wrong_position' ? 'Improper Position / Angle / Blurry' : 'Correct Photo',
            'Accuracy Finding': m.accuracyType === 'false_positive' ? 'False Alarm (Part Had No Issue)' : m.accuracyType === 'false_negative' ? 'CRITICAL: Missed Defect (False Negative)' : 'Accurate Assessment',
            'Admin Remarks': m.adminNote || 'No remark entered',
            'Audited By': m.auditedBy,
            'Audited Date': m.auditedAt,
          });
        });
      });
    });

    if (allMistakes.length > 0) {
      const wsMistakes = XLSX.utils.json_to_sheet(allMistakes);
      XLSX.utils.book_append_sheet(wb, wsMistakes, 'Mistake Log Details');
    }

    const fileName = `Driver_QA_Mistake_Pattern_Report_${dateFrom || 'ALL'}_to_${dateTo || 'ALL'}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Export to PDF
  const handleExportPdf = () => {
    if (!report || report.depotGroups.length === 0) {
      alert('No QA audit data to export.');
      return;
    }

    const doc = new jsPDF('l', 'mm', 'a4');

    doc.setFontSize(15);
    doc.setTextColor(30, 41, 59);
    doc.text('Fleet Driver Inspection QA & Mistake Pattern Audit Report', 14, 15);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleString()} | Date Range: ${dateFrom || 'Beginning'} to ${dateTo || 'Today'} | Depot: ${selectedDepot}`, 14, 21);

    const tableRows: any[] = [];
    filteredDepotGroups.forEach(group => {
      group.drivers.forEach(driver => {
        const inspSummary = driver.inspections && driver.inspections.length > 0
          ? driver.inspections.map(i => `${i.id} (${i.formattedDate})`).slice(0, 2).join('\n')
          : '-';

        tableRows.push([
          group.depotCode,
          driver.driverName,
          driver.driverId,
          inspSummary,
          String(driver.totalPhotosAudited),
          `${driver.photoValidityRate}%`,
          String(driver.wrongPartCount),
          String(driver.wrongPositionCount),
          String(driver.falsePositivesCount),
          String(driver.falseNegativesCount),
          `${driver.overallQualityScore}%`,
        ]);
      });
    });

    autoTable(doc, {
      startY: 26,
      head: [[
        'Depot',
        'Driver Name',
        'ID',
        'Inspection ID & Date Carried Out',
        'Audited Photos',
        'Photo Validity',
        'Wrong Part',
        'Bad Angle',
        'False Pos (OK)',
        'False Neg (Missed)',
        'Score',
      ]],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    // Detailed Mistakes table on additional page if mistakes exist
    const mistakeRows: any[] = [];
    filteredDepotGroups.forEach(group => {
      group.drivers.forEach(driver => {
        driver.mistakes.forEach(m => {
          mistakeRows.push([
            m.inspectionId,
            m.formattedDate || m.timestamp,
            m.driverDepot,
            `${driver.driverName} (${driver.driverId})`,
            m.vehicleNo,
            m.itemTitle,
            m.photoQuality === 'wrong_part' ? 'Wrong Part' : m.photoQuality === 'wrong_position' ? 'Bad Angle' : 'OK',
            m.accuracyType === 'false_positive' ? 'False Alarm (Part OK)' : m.accuracyType === 'false_negative' ? 'Missed Defect' : 'Accurate',
            m.adminNote || '-',
          ]);
        });
      });
    });

    if (mistakeRows.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text('Audited Mistake Incident Details (Inspection ID & Date Carried Out)', 14, 15);
      autoTable(doc, {
        startY: 22,
        head: [[
          'Inspection ID',
          'Date Carried Out',
          'Depot',
          'Driver',
          'Vehicle',
          'Item / Part',
          'Photo Quality',
          'Accuracy Finding',
          'Admin Finding',
        ]],
        body: mistakeRows,
        theme: 'grid',
        headStyles: { fillColor: [185, 28, 28], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 2 },
        alternateRowStyles: { fillColor: [254, 242, 242] },
      });
    }

    doc.save(`Driver_QA_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (score >= 75) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-rose-700 bg-rose-50 border-rose-200';
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-blue-50/70 via-indigo-50/30 to-transparent pointer-events-none rounded-full -mr-20 -mt-20" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                <ShieldCheck className="w-6 h-6" />
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Driver QA & Mistake Pattern Audit
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 max-w-2xl font-medium">
              Monitor photo verification quality (wrong spare part or improper angle), audit spare part accuracy (false alarms vs. missed defects), and analyze driver performance patterns grouped by Depot.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSeedSampleData}
              disabled={isSeeding}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Generate sample audited inspections showing false alarms, wrong spare parts, and angle issues"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
              <span>{isSeeding ? 'Populating...' : 'Populate Sample QA Data'}</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>

            <button
              onClick={handleExportPdf}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>

            <button
              onClick={loadReport}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
              title="Refresh Report"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {seedSuccessMsg && (
          <div className="mt-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{seedSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Audited Photos */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Audited Photos</span>
            <Camera className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900">{report?.summary.totalAuditedPhotos || 0}</span>
            <div className="text-[10px] text-slate-500 font-medium">Across {report?.summary.totalDriversAudited || 0} drivers</div>
          </div>
        </div>

        {/* Photo Validity Rate */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Photo Validity</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-emerald-600">{report?.summary.photoValidityRate || 100}%</span>
            <div className="text-[10px] text-slate-500 font-medium">{report?.summary.correctPhotosCount || 0} correct photos</div>
          </div>
        </div>

        {/* Wrong Part Photos */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Wrong Part</span>
            <HelpCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-amber-600">{report?.summary.wrongPartCount || 0}</span>
            <div className="text-[10px] text-amber-700/80 font-medium">Wrong component snapped</div>
          </div>
        </div>

        {/* Bad Angle / Position */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Bad Position</span>
            <AlertTriangle className="w-4 h-4 text-orange-500" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-orange-600">{report?.summary.wrongPositionCount || 0}</span>
            <div className="text-[10px] text-orange-700/80 font-medium">Too far, blurred, or bad angle</div>
          </div>
        </div>

        {/* False Positives (Spare Part OK, Driver Said Issue) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">False Alarms</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-mono font-bold">FP</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-blue-600">{report?.summary.falsePositivesCount || 0}</span>
            <div className="text-[10px] text-blue-700/80 font-medium">Part was OK (Driver false defect)</div>
          </div>
        </div>

        {/* False Negatives (Missed Defect - HIGH RISK) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Missed Defects</span>
            <AlertOctagon className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-rose-600">{report?.summary.falseNegativesCount || 0}</span>
            <div className="text-[10px] text-rose-700/80 font-medium">CRITICAL: Defect passed by driver</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar & Date Picker */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Date Picker Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5 text-xs text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-bold text-slate-500">From:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-transparent font-medium focus:outline-none cursor-pointer"
              />
              <span className="text-slate-300 mx-1">|</span>
              <span className="font-bold text-slate-500">To:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-transparent font-medium focus:outline-none cursor-pointer"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSetPreset('today')}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                  dateFrom && dateFrom === dateTo && dateFrom === getMalaysiaDateStr()
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => handleSetPreset('7days')}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                7 Days
              </button>
              <button
                onClick={() => handleSetPreset('30days')}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                30 Days
              </button>
              <button
                onClick={() => handleSetPreset('month')}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                This Month
              </button>
              <button
                onClick={() => handleSetPreset('all')}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                  !dateFrom && !dateTo
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                All Time
              </button>
            </div>
          </div>

          {/* Depot & Driver Search & Mistakes Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Show Only Mistakes Filter Toggle */}
            <label className="flex items-center gap-1.5 text-xs text-slate-700 font-bold cursor-pointer select-none bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5 hover:bg-slate-100 transition">
              <input
                type="checkbox"
                checked={showOnlyMistakes}
                onChange={(e) => setShowOnlyMistakes(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Only Drivers with Mistakes</span>
            </label>

            {/* Depot Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5 text-xs">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-bold text-slate-500">Depot:</span>
              <select
                value={selectedDepot}
                onChange={(e) => setSelectedDepot(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Depots</option>
                {availableDepotCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>

            {/* Driver Search */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5 text-xs flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={driverSearch}
                onChange={(e) => setDriverSearch(e.target.value)}
                placeholder="Search driver name, ID, or pattern..."
                className="bg-transparent w-full text-slate-800 font-medium focus:outline-none text-xs"
              />
              {driverSearch && (
                <button type="button" onClick={() => setDriverSearch('')} className="text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Main Content: Grouped by Depot -> Drivers */}
      {loading ? (
        <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-700">Analyzing inspection photos & driver QA patterns...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-6 text-rose-800 text-sm font-medium flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      ) : filteredDepotGroups.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center space-y-4">
          <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800">No Audited Photos or Drivers Match Selected Filters</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              There are no records matching your current filter criteria. You can clear your filters to view all records or populate sample QA audits.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setSelectedDepot('ALL');
                setDriverSearch('');
                setShowOnlyMistakes(false);
              }}
              className="px-4 py-2 rounded-2xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            >
              Reset All Filters (Show All Time)
            </button>
            <button
              onClick={handleSeedSampleData}
              className="px-4 py-2 rounded-2xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition shadow-md shadow-blue-500/20 cursor-pointer inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate Demo QA Pattern Data</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredDepotGroups.map((depotGroup) => (
            <div key={depotGroup.depotCode} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Depot Header */}
              <div className="bg-slate-900 text-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center font-mono font-black text-sm text-blue-300 border border-white/10">
                    {depotGroup.depotCode}
                  </span>
                  <div>
                    <h3 className="font-black text-base tracking-tight text-white flex items-center gap-2">
                      <span>Depot {depotGroup.depotCode}</span>
                      <span className="text-xs font-mono font-medium text-slate-400">({depotGroup.drivers.length} Drivers)</span>
                    </h3>
                    <div className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
                      <span>{depotGroup.totalInspections} Inspections</span>
                      <span>•</span>
                      <span>{depotGroup.totalPhotosAudited} Audited Photos</span>
                    </div>
                  </div>
                </div>

                {/* Depot Accuracy KPI Pill */}
                <div className="flex items-center gap-2">
                  {depotGroup.falseNegativesCount > 0 && (
                    <span className="px-2.5 py-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1">
                      <AlertOctagon className="w-3.5 h-3.5" />
                      <span>{depotGroup.falseNegativesCount} Missed Defects</span>
                    </span>
                  )}
                  {depotGroup.falsePositivesCount > 0 && (
                    <span className="px-2.5 py-1 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{depotGroup.falsePositivesCount} False Alarms</span>
                    </span>
                  )}
                  <div className="text-right pl-2 border-l border-white/10">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Depot Score</div>
                    <div className="text-base font-black text-emerald-400">{depotGroup.depotAccuracyRate}%</div>
                  </div>
                </div>
              </div>

              {/* Drivers Table / Grid under Depot */}
              <div className="divide-y divide-slate-100">
                {depotGroup.drivers.map((driver) => {
                  const hasMistakes = driver.mistakes.length > 0;
                  const hasCritical = driver.falseNegativesCount > 0;

                  return (
                    <div
                      key={driver.driverId}
                      className={`p-4 sm:p-5 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                        hasCritical ? 'bg-rose-50/20 hover:bg-rose-50/40' : hasMistakes ? 'hover:bg-amber-50/20' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      {/* Driver Info */}
                      <div className="flex items-start gap-3.5 min-w-[280px]">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-300 flex items-center justify-center font-bold text-slate-700 shrink-0 shadow-sm">
                          {driver.driverName.charAt(0)}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-slate-900">{driver.driverName}</h4>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                              {driver.driverId}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2 font-medium">
                            <span>{driver.totalInspections} Inspections</span>
                            <span>•</span>
                            <span>{driver.totalPhotosAudited} Photos Audited</span>
                          </div>

                          {/* Carried Out Audited Inspections (ID & Date) */}
                          {driver.inspections && driver.inspections.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                Inspections:
                              </span>
                              {driver.inspections.slice(0, 3).map((insp) => (
                                <span
                                  key={insp.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200"
                                  title={`Inspection ${insp.id} carried out on ${insp.formattedDate} for ${insp.vehicleNo}`}
                                >
                                  <span className="font-bold text-blue-700">{insp.id}</span>
                                  <span className="text-slate-400">•</span>
                                  <span className="text-slate-600 font-sans">{insp.formattedDate}</span>
                                </span>
                              ))}
                              {driver.inspections.length > 3 && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                                  +{driver.inspections.length - 3} more
                                </span>
                              )}
                            </div>
                          )}

                          {/* Identified Patterns */}
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {driver.identifiedPatterns.map((pat, idx) => {
                              const isCrit = pat.includes('CRITICAL');
                              const isWarn = pat.includes('Frequent') || pat.includes('alarm') || pat.includes('issues');
                              return (
                                <span
                                  key={idx}
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                                    isCrit
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                                      : isWarn
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  }`}
                                >
                                  {isCrit && <AlertOctagon className="w-3 h-3 text-rose-600 shrink-0" />}
                                  {isWarn && !isCrit && <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />}
                                  {!isCrit && !isWarn && <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />}
                                  <span>{pat}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Performance Metrics Breakdown */}
                      <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs">
                        {/* Wrong Photos */}
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Photo Quality</span>
                          <div className="flex items-center gap-1.5 font-bold">
                            <span className={driver.wrongPartCount > 0 ? 'text-amber-600' : 'text-slate-600'}>
                              {driver.wrongPartCount} wrong part
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className={driver.wrongPositionCount > 0 ? 'text-orange-600' : 'text-slate-600'}>
                              {driver.wrongPositionCount} bad angle
                            </span>
                          </div>
                        </div>

                        {/* Defect Accuracy */}
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Defect Accuracy</span>
                          <div className="flex items-center gap-1.5 font-bold">
                            <span className={driver.falsePositivesCount > 0 ? 'text-blue-600' : 'text-slate-600'}>
                              {driver.falsePositivesCount} false alarms
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className={driver.falseNegativesCount > 0 ? 'text-rose-600 font-black' : 'text-slate-600'}>
                              {driver.falseNegativesCount} missed
                            </span>
                          </div>
                        </div>

                        {/* Overall Quality Score */}
                        <div className="space-y-0.5 text-right min-w-[70px]">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">QA Score</span>
                          <div className={`px-2.5 py-1 rounded-xl text-xs font-black border text-center ${getScoreColor(driver.overallQualityScore)}`}>
                            {driver.overallQualityScore}%
                          </div>
                        </div>

                        {/* View Mistake History Action */}
                        <button
                          onClick={() => setSelectedDriverForDrilldown(driver)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                            hasMistakes
                              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>
                            {hasMistakes ? `View Mistakes (${driver.mistakes.length})` : 'Audit Log'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DRIVER MISTAKE DRILL-DOWN MODAL */}
      {selectedDriverForDrilldown && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white max-w-4xl w-full rounded-3xl overflow-hidden border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-md">
                  {selectedDriverForDrilldown.driverName.charAt(0)}
                </div>
                <div>
                  <h3 className="font-black text-base text-white">
                    {selectedDriverForDrilldown.driverName} — Mistake History
                  </h3>
                  <div className="text-xs text-slate-400 font-mono">
                    ID: {selectedDriverForDrilldown.driverId} • Depot: {selectedDriverForDrilldown.driverDepot} • Quality Score: {selectedDriverForDrilldown.overallQualityScore}%
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedDriverForDrilldown(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Mistake Cards */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Pattern Summary Banner */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Identified Behavior Patterns & Findings
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedDriverForDrilldown.identifiedPatterns.map((pat, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-800 shadow-xs"
                    >
                      {pat}
                    </span>
                  ))}
                </div>
              </div>

              {/* Carried Out Audited Inspections Summary (ID & Date) */}
              {selectedDriverForDrilldown.inspections && selectedDriverForDrilldown.inspections.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span>Audited Inspections Carried Out ({selectedDriverForDrilldown.inspections.length})</span>
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-500">Depot: {selectedDriverForDrilldown.driverDepot}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedDriverForDrilldown.inspections.map((insp) => (
                      <div
                        key={insp.id}
                        className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-mono flex items-center gap-2 shadow-xs"
                      >
                        <span className="font-bold text-blue-700">{insp.id}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600 font-sans font-medium text-[11px]">{insp.formattedDate}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-700 font-bold text-[11px]">{insp.vehicleNo}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          insp.overallResult === 'Pass' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {insp.overallResult}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedDriverForDrilldown.mistakes.length === 0 ? (
                <div className="p-8 text-center text-slate-500 space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <p className="font-bold text-slate-800 text-sm">No Inspection Mistakes Recorded!</p>
                  <p className="text-xs text-slate-500">
                    All audited photos and checkpoint evaluations from this driver adhere completely to quality guidelines.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Logged Mistake Incidents ({selectedDriverForDrilldown.mistakes.length})
                  </h4>

                  {selectedDriverForDrilldown.mistakes.map((mistake) => {
                    const isFalseAlarm = mistake.accuracyType === 'false_positive';
                    const isMissedDefect = mistake.accuracyType === 'false_negative';
                    const isWrongPart = mistake.photoQuality === 'wrong_part';
                    const isWrongPos = mistake.photoQuality === 'wrong_position';

                    return (
                      <div
                        key={mistake.id}
                        className={`rounded-2xl border p-4 transition space-y-3 ${
                          isMissedDefect
                            ? 'bg-rose-50/50 border-rose-200'
                            : isFalseAlarm
                            ? 'bg-blue-50/40 border-blue-200'
                            : 'bg-amber-50/40 border-amber-200'
                        }`}
                      >
                        {/* Incident Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-black text-xs text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                              {mistake.vehicleNo}
                            </span>
                            <span className="font-bold text-xs text-slate-900">
                              {mistake.itemTitle}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              Inspection ID: <span className="text-blue-700 font-bold">{mistake.inspectionId}</span>
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 font-mono font-bold flex items-center gap-1.5 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
                            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>Date Carried Out: {mistake.formattedDate || mistake.timestamp}</span>
                          </div>
                        </div>

                        {/* Incident Body */}
                        <div className="flex flex-col sm:flex-row gap-4 items-start">
                          {/* Photo Thumbnail */}
                          {mistake.photoUrl ? (
                            <div
                              onClick={() => setZoomPhotoUrl(mistake.photoUrl)}
                              className="relative group w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden border border-slate-300 shrink-0 cursor-pointer shadow-sm bg-slate-900"
                            >
                              <img
                                src={mistake.photoUrl}
                                alt={mistake.itemTitle}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                <Maximize2 className="w-4 h-4" />
                              </div>
                            </div>
                          ) : (
                            <div className="w-24 h-24 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs text-center p-2 shrink-0">
                              No Photo
                            </div>
                          )}

                          {/* Mistake Details */}
                          <div className="space-y-2 flex-1 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Photo Quality Badge */}
                              {isWrongPart && (
                                <span className="px-2 py-0.5 rounded-lg font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Wrong Spare Part Photographed</span>
                                </span>
                              )}
                              {isWrongPos && (
                                <span className="px-2 py-0.5 rounded-lg font-bold bg-orange-100 text-orange-800 border border-orange-300 flex items-center gap-1">
                                  <Camera className="w-3 h-3" />
                                  <span>Improper Angle / Position</span>
                                </span>
                              )}

                              {/* Defect Accuracy Badge */}
                              {isFalseAlarm && (
                                <span className="px-2 py-0.5 rounded-lg font-bold bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>False Alarm: Spare Part is OK (Driver claimed Defect)</span>
                                </span>
                              )}
                              {isMissedDefect && (
                                <span className="px-2.5 py-0.5 rounded-lg font-black bg-rose-600 text-white shadow-xs flex items-center gap-1 animate-pulse">
                                  <AlertOctagon className="w-3.5 h-3.5" />
                                  <span>CRITICAL: Defect Missed by Driver (Driver passed)</span>
                                </span>
                              )}
                            </div>

                            {/* Driver Claim vs Reality */}
                            <div className="grid grid-cols-2 gap-2 bg-white/80 p-2.5 rounded-xl border border-slate-200/80 text-[11px]">
                              <div>
                                <span className="text-slate-400 block font-medium">Driver Claimed:</span>
                                <span className={`font-bold ${mistake.driverClaimStatus === 'Fail' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {mistake.driverClaimStatus === 'Fail' ? '⚠ Defect / Issue' : '✓ Pass (No Issue)'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-medium">Admin QA Verification:</span>
                                <span className="font-bold text-slate-800">
                                  {isFalseAlarm
                                    ? 'Spare part verified in good order'
                                    : isMissedDefect
                                    ? 'Visible defect spotted in evidence'
                                    : 'Confirmed valid condition'}
                                </span>
                              </div>
                            </div>

                            {/* Admin Note */}
                            {mistake.adminNote && (
                              <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs">
                                <span className="font-bold text-slate-900 block text-[11px]">Admin QA Finding:</span>
                                <p className="mt-0.5 font-medium">{mistake.adminNote}</p>
                              </div>
                            )}

                            <div className="text-[10px] text-slate-400 font-mono">
                              Audited by {mistake.auditedBy} on {new Date(mistake.auditedAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                {selectedDriverForDrilldown.mistakes.length} error incidents recorded for this driver.
              </span>
              <button
                onClick={() => setSelectedDriverForDrilldown(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
              >
                Close Drilldown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SIZE PHOTO ZOOM LIGHTBOX */}
      {zoomPhotoUrl && (
        <div className="fixed inset-0 z-70 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-4xl w-full flex flex-col items-center">
            <button
              onClick={() => setZoomPhotoUrl(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white p-2 rounded-full cursor-pointer"
            >
              <X className="w-7 h-7" />
            </button>
            <img
              src={zoomPhotoUrl}
              alt="Enlarged inspection evidence"
              className="max-h-[85vh] max-w-full rounded-2xl object-contain border border-white/20 shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
