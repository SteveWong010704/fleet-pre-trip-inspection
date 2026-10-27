import React, { useState, useEffect, useMemo } from 'react';
import { InspectionRecord, InspectionPhoto, DepotItem, RouteItem } from '../../types';
import { fetchInspections, fetchDepots, fetchRoutes, clearAllInspections, updateInspectionPhotoQaApi } from '../../lib/api';
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
  AlertOctagon,
  ChevronRight,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { getCheckpointSystemChecks } from '../../lib/quickChecklistConfig';
import { SecurityPasswordModal } from '../SecurityPasswordModal';
import { UninspectedDriversAudit } from './UninspectedDriversAudit';

const FOMS_TIME_ZONE = 'Asia/Kuala_Lumpur';
const formatMalaysiaDateTime = (value?: string, fallbackFormatted?: string) => {
  if (fallbackFormatted && typeof fallbackFormatted === 'string' && fallbackFormatted.trim().length > 0) {
    const trimmed = fallbackFormatted.trim();
    if (trimmed.includes('/') || (trimmed.includes('-') && trimmed.includes(':'))) {
      return trimmed;
    }
  }
  if (!value) return fallbackFormatted || '';
  try {
    const rawTrim = typeof value === 'string' ? value.trim() : '';
    // If it's a local datetime string without Z (e.g. "2026-10-22 08:30:00")
    const localMatch = rawTrim.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (localMatch && !rawTrim.includes('Z')) {
      const [, y, m, d, hh, mm, ss] = localMatch;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}, ${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${(ss || '00').padStart(2, '0')}`;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? (fallbackFormatted || value) : new Intl.DateTimeFormat('en-GB', {
      timeZone: FOMS_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(date);
  } catch {
    return fallbackFormatted || value || '';
  }
};

const malaysiaDateKey = (recordOrValue?: any) => {
  if (!recordOrValue) return '';
  if (typeof recordOrValue === 'object') {
    const formatted = String(recordOrValue.formattedDate || '').trim();
    if (formatted) {
      const dmy = formatted.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
      const ymd = formatted.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
    }
    const raw = recordOrValue.timestamp;
    if (raw) return malaysiaDateKey(raw);
    const idMatch = String(recordOrValue.id || '').match(/INSP-(\d{4})(\d{2})(\d{2})/i);
    if (idMatch) return `${idMatch[1]}-${idMatch[2]}-${idMatch[3]}`;
    return '';
  }

  const s = String(recordOrValue).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const localYmd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (localYmd && !s.includes('Z') && !/[+\-]\d{2}:?\d{2}$/.test(s)) {
    return `${localYmd[1]}-${localYmd[2]}-${localYmd[3]}`;
  }
  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return localYmd ? `${localYmd[1]}-${localYmd[2]}-${localYmd[3]}` : '';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: FOMS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const malaysiaTimeKey = (recordOrValue?: any) => {
  if (!recordOrValue) return '00:00';
  if (typeof recordOrValue === 'object') {
    const formatted = String(recordOrValue.formattedDate || '').trim();
    if (formatted) {
      const tm = formatted.match(/(\d{1,2}):(\d{2})/);
      if (tm) return `${tm[1].padStart(2, '0')}:${tm[2]}`;
    }
    const raw = recordOrValue.timestamp;
    if (raw) return malaysiaTimeKey(raw);
    return '00:00';
  }

  const s = String(recordOrValue).trim();
  const tm = s.match(/(\d{1,2}):(\d{2})/);
  if (tm && (!s.includes('Z') || s.includes(' '))) {
    return `${tm[1].padStart(2, '0')}:${tm[2]}`;
  }
  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : '00:00';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: FOMS_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  return `${get('hour')}:${get('minute')}`;
};

export interface InspectionHistoryProps {
  onNavigateToQaReport?: () => void;
  activeAdmin?: any;
}

export const InspectionHistory: React.FC<InspectionHistoryProps> = ({ onNavigateToQaReport, activeAdmin }) => {
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [masterDepots, setMasterDepots] = useState<DepotItem[]>([]);
  const [masterRoutes, setMasterRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);
  
  const [auditSubTab, setAuditSubTab] = useState<'completed_inspections' | 'uninspected_drivers'>('completed_inspections');

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

  // Photo QA Audit Form State in Preview Modal
  const [qaQuality, setQaQuality] = useState<'correct' | 'wrong_part' | 'wrong_position'>('correct');
  const [qaAccuracy, setQaAccuracy] = useState<'accurate' | 'false_positive' | 'false_negative'>('accurate');
  const [qaNote, setQaNote] = useState<string>('');
  const [isSavingQa, setIsSavingQa] = useState<boolean>(false);
  const [qaSaveSuccess, setQaSaveSuccess] = useState<boolean>(false);

  // Synchronize QA audit state when opening preview modal
  useEffect(() => {
    if (previewPhoto) {
      const existing = previewPhoto.qaAudit || (activeRecord?.qaAudits ? (activeRecord.qaAudits[previewPhoto.url] || activeRecord.qaAudits[previewPhoto.slotName || ''] || activeRecord.qaAudits[previewPhoto.itemId || '']) : undefined);
      if (existing) {
        setQaQuality(existing.photoQuality || 'correct');
        setQaAccuracy(existing.accuracyType || 'accurate');
        setQaNote(existing.adminNote || '');
      } else {
        setQaQuality('correct');
        setQaAccuracy('accurate');
        setQaNote('');
      }
      setQaSaveSuccess(false);
    }
  }, [previewPhoto, activeRecord]);

  const handleSaveQaDecision = async (
    qualityOverride?: 'correct' | 'wrong_part' | 'wrong_position',
    accuracyOverride?: 'accurate' | 'false_positive' | 'false_negative',
    noteOverride?: string
  ) => {
    if (!activeRecord || !previewPhoto) return;
    const quality = qualityOverride !== undefined ? qualityOverride : qaQuality;
    const accuracy = accuracyOverride !== undefined ? accuracyOverride : qaAccuracy;
    const note = noteOverride !== undefined ? noteOverride : qaNote;

    try {
      setIsSavingQa(true);
      const photoKey = previewPhoto.url || previewPhoto.slotName || previewPhoto.itemId || 'photo';
      const updatedInsp = await updateInspectionPhotoQaApi(activeRecord.id, {
        photoUrlOrSlot: photoKey,
        photoQuality: quality,
        accuracyType: accuracy,
        adminNote: note.trim(),
        auditedBy: activeAdmin?.name || activeAdmin?.username || 'Steve Wong (Admin)',
      });

      // Update activeRecord
      setActiveRecord(updatedInsp);
      // Update inspections list in place
      setInspections(prev => prev.map(item => item.id === updatedInsp.id ? updatedInsp : item));
      // Update previewPhoto in place
      const isClean = quality === 'correct' && accuracy === 'accurate' && !note.trim();
      const updatedPhoto: InspectionPhoto = {
        ...previewPhoto,
        qaAudit: isClean ? undefined : {
          photoQuality: quality,
          accuracyType: accuracy,
          adminNote: note.trim(),
          auditedBy: activeAdmin?.name || activeAdmin?.username || 'Steve Wong (Admin)',
          auditedAt: new Date().toISOString(),
        },
      };
      setPreviewPhoto(updatedPhoto);
      setQaQuality(quality);
      setQaAccuracy(accuracy);
      setQaSaveSuccess(true);
      setTimeout(() => setQaSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(`Failed to save QA decision: ${err.message}`);
    } finally {
      setIsSavingQa(false);
    }
  };

  const handleToggleWrongPart = () => {
    const nextQuality: 'correct' | 'wrong_part' = qaQuality === 'wrong_part' ? 'correct' : 'wrong_part';
    setQaQuality(nextQuality);
    handleSaveQaDecision(nextQuality, qaAccuracy, qaNote);
  };

  const handleToggleBadAngle = () => {
    const nextQuality: 'correct' | 'wrong_position' = qaQuality === 'wrong_position' ? 'correct' : 'wrong_position';
    setQaQuality(nextQuality);
    handleSaveQaDecision(nextQuality, qaAccuracy, qaNote);
  };

  const handleToggleFalseAlarm = () => {
    const nextAccuracy: 'accurate' | 'false_positive' = qaAccuracy === 'false_positive' ? 'accurate' : 'false_positive';
    setQaAccuracy(nextAccuracy);
    handleSaveQaDecision(qaQuality, nextAccuracy, qaNote);
  };

  const handleToggleFalseNegative = () => {
    const nextAccuracy: 'accurate' | 'false_negative' = qaAccuracy === 'false_negative' ? 'accurate' : 'false_negative';
    setQaAccuracy(nextAccuracy);
    handleSaveQaDecision(qaQuality, nextAccuracy, qaNote);
  };

  const handleResetToAccurate = () => {
    setQaQuality('correct');
    setQaAccuracy('accurate');
    setQaNote('');
    handleSaveQaDecision('correct', 'accurate', '');
  };

  const renderPhotoQaBadge = (photo?: InspectionPhoto) => {
    if (!photo) return null;
    const qa = photo.qaAudit || (activeRecord?.qaAudits ? (activeRecord.qaAudits[photo.url] || activeRecord.qaAudits[photo.slotName || ''] || activeRecord.qaAudits[photo.itemId || '']) : undefined);
    
    const isWrongPart = qa?.photoQuality === 'wrong_part';
    const isWrongPos = qa?.photoQuality === 'wrong_position';
    const isFalsePos = qa?.accuracyType === 'false_positive';
    const isFalseNeg = qa?.accuracyType === 'false_negative';
    const hasMistake = isWrongPart || isWrongPos || isFalsePos || isFalseNeg;

    if (!qa || !hasMistake) {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); setPreviewPhoto(photo); }}
          className="w-full text-[10px] font-bold py-1 px-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition flex items-center justify-center gap-1 cursor-pointer"
        >
          <ShieldCheck className="w-3 h-3 text-slate-500" />
          <span>Audit Photo</span>
        </button>
      );
    }

    return (
      <div
        onClick={(e) => { e.stopPropagation(); setPreviewPhoto(photo); }}
        className="space-y-1 cursor-pointer group"
        title="Click to edit QA audit finding"
      >
        <div className="flex flex-wrap gap-1">
          {isWrongPart && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
              ⚠ Wrong Part
            </span>
          )}
          {isWrongPos && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-300">
              📐 Bad Angle
            </span>
          )}
          {isFalsePos && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
              ⚡ False Alarm (Part OK)
            </span>
          )}
          {isFalseNeg && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-600 text-white border border-rose-700 animate-pulse">
              🚨 Missed Defect (False Neg)
            </span>
          )}
        </div>
        {qa.adminNote && (
          <div className="text-[9px] text-slate-500 truncate" title={qa.adminNote}>
            Note: {qa.adminNote}
          </div>
        )}
      </div>
    );
  };

  const handlePhotoImgError = (e: React.SyntheticEvent<HTMLImageElement>, photoUrl?: string, itemCode?: number | string) => {
    const img = e.currentTarget;
    if (img.dataset.fallbackTried === '2') return;

    const attempts = Number(img.dataset.fallbackTried || 0);
    img.dataset.fallbackTried = String(attempts + 1);

    if (!activeRecord) return;
    const dateStr = activeRecord.timestamp ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(activeRecord.timestamp)) : '';
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchDepots().catch(() => []),
      fetchRoutes().catch(() => []),
    ]).then(([depots, routes]) => {
      if (cancelled) return;
      setMasterDepots(Array.isArray(depots) ? depots : []);
      setMasterRoutes(Array.isArray(routes) ? routes : []);
    });
    return () => { cancelled = true; };
  }, []);

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

  // Use Depot / Route master data for filters, while retaining historical values
  // present in inspection records so old audits remain searchable.
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    masterDepots.forEach(depot => {
      const code = String(depot.code || depot.id || '').trim().toUpperCase();
      if (code) set.add(code);
    });
    inspections.forEach(r => {
      if (r.vehicleBranch) set.add(r.vehicleBranch.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [masterDepots, inspections]);

  const availableRoutes = useMemo(() => {
    const set = new Set<string>();
    masterRoutes.forEach(route => {
      const code = String(route.code || route.id || '').trim().toUpperCase();
      if (code) set.add(code);
    });
    inspections.forEach(r => {
      if (r.route && r.route !== 'General Route' && !r.route.startsWith('Route-')) {
        set.add(r.route.trim().toUpperCase());
      }
    });
    return Array.from(set).sort();
  }, [masterRoutes, inspections]);

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

      // 5. Time filter (e.g. 08:00 to 17:00 in UTC+8)
      if (timeFrom || timeTo) {
        const recordTime = malaysiaTimeKey(r);
        if (recordTime) {
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
        const getTs = (rec: InspectionRecord) => {
          if (rec.timestamp) {
            const t = new Date(rec.timestamp).getTime();
            if (!isNaN(t)) return t;
          }
          const dk = malaysiaDateKey(rec);
          const tk = malaysiaTimeKey(rec);
          if (dk) return new Date(`${dk}T${tk || '00:00'}:00+08:00`).getTime();
          return 0;
        };
        valA = getTs(a);
        valB = getTs(b);
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

  const handleConfirmClearAll = async (password: string) => {
    await clearAllInspections(password);
    await loadInspections();
  };

  // Checkpoint definitions for itemized Defect Audit Matrix extraction
  const AUDIT_CHECKPOINT_DEFS = [
    { key: 'tires_wheels', code: 1, name: 'Tires & Wheels' },
    { key: 'brake_system', code: 2, name: 'Brake System & Fluid' },
    { key: 'lights_indicators', code: 3, name: 'Lights & Indicators' },
    { key: 'steering_handling', code: 4, name: 'Steering & Handling' },
    { key: 'radiator_coolant', code: 5, name: 'Radiator & Coolant' },
    { key: 'fluids_powertrain', code: 6, name: 'Engine Oil & Powertrain' },
    { key: 'diesel_fuel_cap', code: 7, name: 'Diesel Fuel Cap & Tank' },
    { key: 'emergency_equipment', code: 8, name: 'Emergency Equipment (APAD)' },
    { key: 'body_passenger_doors', code: 9, name: 'Cargo & Body' },
    { key: 'dashboard_warnings', code: 10, name: 'Dashboard & Meter' },
  ];

  const isBrakeKeyword = (text?: string): boolean => {
    if (!text) return false;
    const lower = text.toLowerCase();
    return (
      lower.includes('brake') ||
      lower.includes('brek') ||
      lower.includes('handbrake') ||
      lower.includes('foot brake') ||
      lower.includes('spongy pedal') ||
      lower.includes('air pressure')
    );
  };

  const getCheckpointPartStatus = (record: InspectionRecord, checkpointKey: string): { status: 'Good' | 'Grounded' | 'N/A'; note?: string; text: string } => {
    const items = Array.isArray(record.items) ? record.items : [];

    // Match item strictly by item.id first!
    let item = items.find(i => i.id === checkpointKey);

    // Fallback ONLY for legacy 10-point records where items had no .id property:
    if (!item && !items.some(i => Boolean(i.id)) && items.length >= 10) {
      const targetDef = AUDIT_CHECKPOINT_DEFS.find(d => d.key === checkpointKey);
      if (targetDef) {
        item = items.find(i => i.code === targetDef.code);
      }
    }

    // SPECIAL HANDLING: Checkpoint 2 (Brake System & Fluid) vs Checkpoint 6 (Engine Oil & Powertrain)
    // Rule: Anything related to brake (brake fluid, foot brake, handbrake, air pressure) belongs strictly under Checkpoint 2.
    if (checkpointKey === 'brake_system') {
      // 1. Direct fail on brake_system checkpoint
      if (item && item.status === 'Fail') {
        const note = (item.defectNote || 'Brake system fault flagged').trim();
        return { status: 'Grounded', note, text: `GROUNDED: ${note}` };
      }

      // 2. Re-attribute any brake defect recorded under Checkpoint 6 (fluids_powertrain) or other checkpoints
      const fluidsItem = items.find(i => i.id === 'fluids_powertrain');
      if (fluidsItem) {
        if (fluidsItem.status === 'Fail' && isBrakeKeyword(fluidsItem.defectNote)) {
          const brakeNote = fluidsItem.defectNote!.trim();
          return { status: 'Grounded', note: brakeNote, text: `GROUNDED: ${brakeNote}` };
        }
        if (fluidsItem.systemChecks && fluidsItem.systemChecks.brake_fluid === false) {
          return { status: 'Grounded', note: 'Brake fluid reservoir below Min', text: 'GROUNDED: Brake fluid reservoir below Min' };
        }
      }

      // 3. Check overall defect summary if record failed and mentions brake
      if (record.overallResult === 'Fail' && record.defectSummary && isBrakeKeyword(record.defectSummary)) {
        return { status: 'Grounded', note: record.defectSummary, text: `GROUNDED: ${record.defectSummary}` };
      }

      if (item && item.status === 'NA') {
        return { status: 'N/A', text: 'N/A' };
      }

      return { status: 'Good', text: 'Good (Brakes & Fluid OK)' };
    }

    if (checkpointKey === 'fluids_powertrain') {
      if (item && item.status === 'Fail') {
        const rawNote = (item.defectNote || '').trim();
        // If defect was purely about brake fluid or brakes, do not ground Checkpoint 6 for it!
        if (isBrakeKeyword(rawNote)) {
          const nonBrakeParts = rawNote
            .split(/[;,]/)
            .map(s => s.trim())
            .filter(s => s.length > 0 && !isBrakeKeyword(s));

          if (nonBrakeParts.length === 0) {
            // Solely a brake defect; it is moved to Checkpoint 2 so Checkpoint 6 is Good
            return { status: 'Good', text: 'Good (Engine Oil & Powertrain Pass)' };
          } else {
            const sanitizedNote = nonBrakeParts.join('; ');
            return { status: 'Grounded', note: sanitizedNote, text: `GROUNDED: ${sanitizedNote}` };
          }
        }

        return { status: 'Grounded', note: rawNote, text: `GROUNDED: ${rawNote}` };
      }

      if (item && item.status === 'NA') {
        return { status: 'N/A', text: 'N/A' };
      }

      return { status: 'Good', text: 'Good (Engine Oil & Powertrain Pass)' };
    }

    if (!item) {
      return { status: 'Good', text: 'Good (Routine Pass)' };
    }

    if (item.status === 'Fail') {
      const note = (item.defectNote || 'Defect reported').trim();
      return {
        status: 'Grounded',
        note,
        text: `GROUNDED: ${note}`,
      };
    }

    if (item.status === 'NA') {
      return { status: 'N/A', text: 'N/A' };
    }

    return { status: 'Good', text: 'Good' };
  };

  const getGroundedDefectPartsSummary = (record: InspectionRecord): string => {
    const grounded: string[] = [];
    for (const cp of AUDIT_CHECKPOINT_DEFS) {
      const res = getCheckpointPartStatus(record, cp.key);
      if (res.status === 'Grounded') {
        grounded.push(`${cp.name}${res.note ? ` (${res.note})` : ''}`);
      }
    }
    return grounded.length > 0 ? grounded.join('; ') : 'None (All Systems Good)';
  };

  // Helper to extract checkpoint photo URL
  const getCheckpointPhotoUrl = (record: InspectionRecord, checkpointKey: string): string => {
    if (Array.isArray(record.photos)) {
      const p = record.photos.find(ph => ph.itemId === checkpointKey);
      if (p && p.url) return p.url;
    }
    if (Array.isArray(record.items)) {
      const it = record.items.find(i => i.id === checkpointKey);
      if (it && it.photoUrl) return it.photoUrl;
    }
    return '-';
  };

  interface DefectEntry {
    tag: string;
    remark: string;
  }

  // Parse structured defect tags and remarks for a specific checkpoint
  const getCheckpointDefects = (record: InspectionRecord, checkpointKey: string): DefectEntry[] => {
    const items = Array.isArray(record.items) ? record.items : [];
    let item = items.find(i => i.id === checkpointKey);
    if (!item && !items.some(i => Boolean(i.id)) && items.length >= 10) {
      const targetDef = AUDIT_CHECKPOINT_DEFS.find(d => d.key === checkpointKey);
      if (targetDef) {
        item = items.find(i => i.code === targetDef.code);
      }
    }

    const defects: DefectEntry[] = [];

    const parseItemDefects = (it: any): DefectEntry[] => {
      const list: DefectEntry[] = [];
      const tags: string[] = Array.isArray(it.defectTags) && it.defectTags.length > 0 ? it.defectTags : [];

      if (tags.length > 0) {
        tags.forEach((t: string) => {
          const raw = (t || '').trim();
          if (!raw) return;
          const slotMatch = raw.match(/^\[Failed:\s*([^\]]+)\]\s*(.*)$/i);
          if (slotMatch) {
            const slotName = slotMatch[1].trim();
            const tagText = slotMatch[2].trim() || 'Defect';
            list.push({ tag: tagText, remark: `${slotName}: ${tagText}` });
          } else {
            list.push({ tag: raw, remark: raw });
          }
        });
      }

      // If no tags or need to extract from defectNote
      if (list.length === 0 && it.defectNote && it.defectNote.trim()) {
        const parts = it.defectNote.split(/[;\n]/).map((s: string) => s.trim()).filter(Boolean);
        parts.forEach((p: string) => {
          const slotMatch = p.match(/^\[Failed:\s*([^\]]+)\]\s*(.*)$/i);
          if (slotMatch) {
            const slotName = slotMatch[1].trim();
            const tagText = slotMatch[2].trim() || 'Defect';
            list.push({ tag: tagText, remark: `${slotName}: ${tagText}` });
          } else {
            list.push({ tag: p, remark: p });
          }
        });
      }

      // Parse systemChecks
      if (it.systemChecks) {
        Object.entries(it.systemChecks).forEach(([chkKey, chkVal]) => {
          if (chkVal === false) {
            const checkLabel = chkKey.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
            const tag = `${checkLabel} Fault`;
            if (!list.some(d => d.tag.toLowerCase().includes(checkLabel.toLowerCase()))) {
              list.push({ tag, remark: `${checkLabel} failed physical check` });
            }
          }
        });
      }

      // Parse dashboardChecks
      if (it.id === 'dashboard_warnings' && it.dashboardChecks) {
        const dc = it.dashboardChecks;
        if (dc.engineLightOff === false && !list.some(d => d.tag.includes('Engine'))) {
          list.push({ tag: 'Check Engine Warning Lamp ON', remark: 'Check Engine indicator active' });
        }
        if (dc.doubleSignalOk === false && !list.some(d => d.tag.includes('Signal') || d.tag.includes('Hazard'))) {
          list.push({ tag: 'Hazard / Double Signal Faulty', remark: 'Hazard blinkers faulty' });
        }
        if (dc.batteryLightOff === false && !list.some(d => d.tag.includes('Battery'))) {
          list.push({ tag: 'Alternator / Battery Lamp ON', remark: 'Battery / charging warning lamp ON' });
        }
        if (dc.oilLightOff === false && !list.some(d => d.tag.includes('Oil'))) {
          list.push({ tag: 'Engine Oil Pressure Lamp ON', remark: 'Low engine oil pressure indicator ON' });
        }
      }

      if (list.length === 0 && it.status === 'Fail') {
        list.push({
          tag: 'Defect Flagged',
          remark: it.defectNote?.trim() || 'Defect reported',
        });
      }

      return list;
    };

    // Rule: Anything related to brake belongs strictly under Checkpoint 2 (brake_system)
    if (checkpointKey === 'brake_system') {
      if (item && item.status === 'Fail') {
        defects.push(...parseItemDefects(item));
      }
      // Re-attribute any brake defect from fluids_powertrain
      const fluidsItem = items.find(i => i.id === 'fluids_powertrain');
      if (fluidsItem) {
        if (fluidsItem.status === 'Fail' && isBrakeKeyword(fluidsItem.defectNote)) {
          const rawNote = fluidsItem.defectNote!.trim();
          const brakeParts = rawNote.split(/[;\n]/).map(s => s.trim()).filter(s => isBrakeKeyword(s));
          brakeParts.forEach(bp => {
            defects.push({
              tag: 'Brake Fluid Below Min / Reservoir Leak',
              remark: bp.replace(/^\[Failed:\s*([^\]]+)\]/, '$1: ').trim(),
            });
          });
        }
        if (fluidsItem.systemChecks && fluidsItem.systemChecks.brake_fluid === false) {
          if (!defects.some(d => d.tag.includes('Brake Fluid'))) {
            defects.push({
              tag: 'Brake Fluid Below Min / Reservoir Leak',
              remark: 'Brake fluid reservoir below MIN line',
            });
          }
        }
      }
      if (defects.length === 0 && record.overallResult === 'Fail' && record.defectSummary && isBrakeKeyword(record.defectSummary)) {
        defects.push({
          tag: 'Brake System Defect',
          remark: record.defectSummary,
        });
      }
      return defects;
    }

    if (checkpointKey === 'fluids_powertrain') {
      if (item && item.status === 'Fail') {
        const raw = parseItemDefects(item);
        // Strictly exclude all brake defects from Checkpoint 6
        const nonBrake = raw.filter(d => !isBrakeKeyword(d.tag) && !isBrakeKeyword(d.remark));
        defects.push(...nonBrake);
      }
      return defects;
    }

    if (item && item.status === 'Fail') {
      defects.push(...parseItemDefects(item));
    }

    return defects;
  };

  // Export to Excel (.xlsx) - Single tab, Condition (Good / Defect), and Defect Tag & Remark strictly split into 2 separate rows
  const handleExportExcel = () => {
    if (filteredInspections.length === 0) {
      alert('No inspection records to export with the selected filters.');
      return;
    }

    // Single Worksheet: All checkpoints listed vertically.
    // When a defect exists, Defect Tag and Defect Remark are split into 2 distinct rows.
    let rowSequence = 0;
    const auditRows: any[] = [];

    filteredInspections.forEach((r, recordIndex) => {
      const isGrounded = r.overallResult === 'Fail';
      const gps = r.gpsLocation?.lat && r.gpsLocation?.lng
        ? `${r.gpsLocation.lat.toFixed(5)}, ${r.gpsLocation.lng.toFixed(5)}`
        : 'N/A';

      AUDIT_CHECKPOINT_DEFS.forEach((cp) => {
        const defects = getCheckpointDefects(r, cp.key);
        const partStatus = getCheckpointPartStatus(r, cp.key);
        const photoUrl = getCheckpointPhotoUrl(r, cp.key);

        if (defects.length > 0) {
          // Checkpoint has defect(s) -> split each defect into 2 separate rows:
          // Row 1 for Defect Tag, Row 2 for Defect Remark
          defects.forEach((def) => {
            // Row 1: Defect Tag
            rowSequence++;
            auditRows.push({
              'No.': rowSequence,
              'Inspection Seq': recordIndex + 1,
              'Certificate ID': r.id,
              'Inspection Date & Time': formatMalaysiaDateTime(r.timestamp) || r.formattedDate,
              'Vehicle Plate': r.vehicleNo,
              'Vehicle Type': r.truckCategory || 'Small Truck',
              'Branch / Depot': r.vehicleBranch || 'BL',
              'Route / Area': r.route || (r.vehicleBranch ? `${r.vehicleBranch}01` : 'BL01'),
              'Driver Name': r.driverName,
              'Driver ID': r.driverId,
              'Odometer (KM)': r.odometer,
              'Fuel Level (%)': `${r.fuelLevel}%`,
              'Checkpoint Code': cp.code,
              'Inspection Part Name': `[${cp.code}] ${cp.name}`,
              'Condition': 'Defect',
              'Defect Entry Type': 'Defect Tag',
              'Defect Tag': def.tag,
              'Defect Remark': '-',
              'Photo Evidence URL': photoUrl,
              'GPS Coordinates': gps,
              'Vehicle Overall Status': isGrounded ? 'GROUNDED' : 'Ready (Good)',
            });

            // Row 2: Defect Remark (distinct line item)
            rowSequence++;
            auditRows.push({
              'No.': rowSequence,
              'Inspection Seq': recordIndex + 1,
              'Certificate ID': r.id,
              'Inspection Date & Time': formatMalaysiaDateTime(r.timestamp) || r.formattedDate,
              'Vehicle Plate': r.vehicleNo,
              'Vehicle Type': r.truckCategory || 'Small Truck',
              'Branch / Depot': r.vehicleBranch || 'BL',
              'Route / Area': r.route || (r.vehicleBranch ? `${r.vehicleBranch}01` : 'BL01'),
              'Driver Name': r.driverName,
              'Driver ID': r.driverId,
              'Odometer (KM)': r.odometer,
              'Fuel Level (%)': `${r.fuelLevel}%`,
              'Checkpoint Code': cp.code,
              'Inspection Part Name': `[${cp.code}] ${cp.name}`,
              'Condition': 'Defect',
              'Defect Entry Type': 'Defect Remark',
              'Defect Tag': '-',
              'Defect Remark': def.remark,
              'Photo Evidence URL': photoUrl,
              'GPS Coordinates': gps,
              'Vehicle Overall Status': isGrounded ? 'GROUNDED' : 'Ready (Good)',
            });
          });
        } else {
          // Checkpoint is Good or N/A -> exactly 1 single row
          rowSequence++;
          const condition = partStatus.status === 'N/A' ? 'N/A' : 'Good';
          auditRows.push({
            'No.': rowSequence,
            'Inspection Seq': recordIndex + 1,
            'Certificate ID': r.id,
            'Inspection Date & Time': formatMalaysiaDateTime(r.timestamp) || r.formattedDate,
            'Vehicle Plate': r.vehicleNo,
            'Vehicle Type': r.truckCategory || 'Small Truck',
            'Branch / Depot': r.vehicleBranch || 'BL',
            'Route / Area': r.route || (r.vehicleBranch ? `${r.vehicleBranch}01` : 'BL01'),
            'Driver Name': r.driverName,
            'Driver ID': r.driverId,
            'Odometer (KM)': r.odometer,
            'Fuel Level (%)': `${r.fuelLevel}%`,
            'Checkpoint Code': cp.code,
            'Inspection Part Name': `[${cp.code}] ${cp.name}`,
            'Condition': condition,
            'Defect Entry Type': '-',
            'Defect Tag': '-',
            'Defect Remark': condition === 'Good' ? '-' : 'N/A',
            'Photo Evidence URL': photoUrl,
            'GPS Coordinates': gps,
            'Vehicle Overall Status': isGrounded ? 'GROUNDED' : 'Ready (Good)',
          });
        }
      });
    });

    // Create workbook with ONLY ONE single tab as requested
    const workbook = XLSX.utils.book_new();
    const wsAudit = XLSX.utils.json_to_sheet(auditRows);
    wsAudit['!cols'] = [
      { wch: 6 },  // No.
      { wch: 14 }, // Inspection Seq
      { wch: 22 }, // Certificate ID
      { wch: 20 }, // Date & Time
      { wch: 14 }, // Vehicle Plate
      { wch: 14 }, // Vehicle Type
      { wch: 14 }, // Branch
      { wch: 14 }, // Route
      { wch: 18 }, // Driver Name
      { wch: 12 }, // Driver ID
      { wch: 14 }, // Odometer
      { wch: 14 }, // Fuel Level
      { wch: 16 }, // Checkpoint Code
      { wch: 30 }, // Inspection Part Name
      { wch: 14 }, // Condition
      { wch: 18 }, // Defect Entry Type
      { wch: 38 }, // Defect Tag
      { wch: 45 }, // Defect Remark
      { wch: 36 }, // Photo Evidence URL
      { wch: 24 }, // GPS Coordinates
      { wch: 22 }, // Overall Status
    ];
    XLSX.utils.book_append_sheet(workbook, wsAudit, 'Vehicle Inspection Audit');

    const timestamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    XLSX.writeFile(workbook, `Fleet_Vehicle_Inspection_Audit_${timestamp}.xlsx`);
  };

  // Export to CSV matching the single-sheet format with split rows for Defect Tag and Defect Remark
  const handleExportCSV = () => {
    if (filteredInspections.length === 0) {
      alert('No inspection records to export with the selected filters.');
      return;
    }

    const headers = [
      'No',
      'Inspection Seq',
      'Certificate ID',
      'Date & Time',
      'Vehicle Plate',
      'Vehicle Type',
      'Branch',
      'Route / Area',
      'Driver Name',
      'Driver ID',
      'Odometer KM',
      'Fuel Level %',
      'Checkpoint Code',
      'Inspection Part Name',
      'Condition',
      'Defect Entry Type',
      'Defect Tag',
      'Defect Remark',
      'Photo Evidence URL',
      'GPS Coordinates',
      'Vehicle Overall Status',
    ];

    let rowNum = 0;
    const rows: (string | number)[][] = [];

    filteredInspections.forEach((r, recordIndex) => {
      const isGrounded = r.overallResult === 'Fail';
      const gps = r.gpsLocation?.lat && r.gpsLocation?.lng
        ? `${r.gpsLocation.lat.toFixed(5)} ${r.gpsLocation.lng.toFixed(5)}`
        : 'N/A';

      AUDIT_CHECKPOINT_DEFS.forEach((cp) => {
        const defects = getCheckpointDefects(r, cp.key);
        const partStatus = getCheckpointPartStatus(r, cp.key);
        const photoUrl = getCheckpointPhotoUrl(r, cp.key);

        if (defects.length > 0) {
          defects.forEach((def) => {
            // Row 1: Defect Tag
            rowNum++;
            rows.push([
              rowNum,
              recordIndex + 1,
              `"${r.id}"`,
              `"${formatMalaysiaDateTime(r.timestamp) || r.formattedDate}"`,
              `"${r.vehicleNo}"`,
              `"${r.truckCategory || 'Small Truck'}"`,
              `"${r.vehicleBranch || 'BL'}"`,
              `"${r.route || (r.vehicleBranch ? `${r.vehicleBranch}01` : 'BL01')}"`,
              `"${r.driverName}"`,
              `"${r.driverId}"`,
              r.odometer,
              r.fuelLevel,
              cp.code,
              `"[${cp.code}] ${cp.name}"`,
              `"Defect"`,
              `"Defect Tag"`,
              `"${def.tag.replace(/"/g, '""')}"`,
              `"-"`,
              `"${photoUrl.replace(/"/g, '""')}"`,
              `"${gps}"`,
              `"${isGrounded ? 'GROUNDED' : 'Ready (Good)'}"`,
            ]);

            // Row 2: Defect Remark (distinct line item)
            rowNum++;
            rows.push([
              rowNum,
              recordIndex + 1,
              `"${r.id}"`,
              `"${formatMalaysiaDateTime(r.timestamp) || r.formattedDate}"`,
              `"${r.vehicleNo}"`,
              `"${r.truckCategory || 'Small Truck'}"`,
              `"${r.vehicleBranch || 'BL'}"`,
              `"${r.route || (r.vehicleBranch ? `${r.vehicleBranch}01` : 'BL01')}"`,
              `"${r.driverName}"`,
              `"${r.driverId}"`,
              r.odometer,
              r.fuelLevel,
              cp.code,
              `"[${cp.code}] ${cp.name}"`,
              `"Defect"`,
              `"Defect Remark"`,
              `"-"`,
              `"${def.remark.replace(/"/g, '""')}"`,
              `"${photoUrl.replace(/"/g, '""')}"`,
              `"${gps}"`,
              `"${isGrounded ? 'GROUNDED' : 'Ready (Good)'}"`,
            ]);
          });
        } else {
          rowNum++;
          const condition = partStatus.status === 'N/A' ? 'N/A' : 'Good';
          rows.push([
            rowNum,
            recordIndex + 1,
            `"${r.id}"`,
            `"${formatMalaysiaDateTime(r.timestamp) || r.formattedDate}"`,
            `"${r.vehicleNo}"`,
            `"${r.truckCategory || 'Small Truck'}"`,
            `"${r.vehicleBranch || 'BL'}"`,
            `"${r.route || (r.vehicleBranch ? `${r.vehicleBranch}01` : 'BL01')}"`,
            `"${r.driverName}"`,
            `"${r.driverId}"`,
            r.odometer,
            r.fuelLevel,
            cp.code,
            `"[${cp.code}] ${cp.name}"`,
            `"${condition}"`,
            `"-"`,
            `"-"`,
            `"${condition === 'Good' ? '-' : 'N/A'}"`,
            `"${photoUrl.replace(/"/g, '""')}"`,
            `"${gps}"`,
            `"${isGrounded ? 'GROUNDED' : 'Ready (Good)'}"`,
          ]);
        }
      });
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((e) => e.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Fleet_Vehicle_Inspection_Audit_${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}.csv`);
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
      formatMalaysiaDateTime(r.timestamp) || r.formattedDate,
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

    const timestamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    doc.save(`Fleet_Inspection_Audit_${timestamp}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Top Audit Navigation Switch between Completed Inspections & Drivers Missing Inspection */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-2.5 shadow-xs no-print">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setAuditSubTab('completed_inspections')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
              auditSubTab === 'completed_inspections'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Completed Inspections & QA Audit</span>
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 font-extrabold">
              {filteredInspections.length}
            </span>
          </button>

          <button
            onClick={() => setAuditSubTab('uninspected_drivers')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
              auditSubTab === 'uninspected_drivers'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-700 hover:bg-rose-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-rose-300" />
            <span>Drivers Missing Inspection Audit</span>
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-800 font-extrabold">
              Compliance
            </span>
          </button>
        </div>

        {auditSubTab === 'completed_inspections' ? (
          <button
            onClick={() => setAuditSubTab('uninspected_drivers')}
            className="text-xs font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition cursor-pointer self-start sm:self-auto shadow-xs"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>Filter Drivers Without Inspection</span>
          </button>
        ) : (
          <button
            onClick={() => setAuditSubTab('completed_inspections')}
            className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition cursor-pointer self-start sm:self-auto shadow-xs"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>View Completed Inspections Archive</span>
          </button>
        )}
      </div>

      {auditSubTab === 'uninspected_drivers' ? (
        <UninspectedDriversAudit activeAdmin={activeAdmin} />
      ) : (
        <>
          {/* Top Filter and Search Control Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-slate-800 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Inspection Audit Records & Export</h2>
            <p className="text-xs text-slate-500">Filter, search, and export vehicle inspection reports in PDF, Excel (.xlsx), or CSV.</p>
          </div>

          {/* Export Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {onNavigateToQaReport && (
              <button
                onClick={onNavigateToQaReport}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer shadow-indigo-500/20"
                title="View Driver QA & Mistake Patterns"
              >
                <ShieldCheck className="w-4 h-4 text-indigo-200" />
                <span>Driver QA & Patterns</span>
              </button>
            )}

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
                onClick={() => setShowClearConfirmModal(true)}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold px-3 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
                title="Clear all inspection records (Requires master password)"
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
                        {formatMalaysiaDateTime(r.timestamp) || r.formattedDate}
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
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-xs bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                              <span>{r.defectCount} Grounded Part(s)</span>
                            </span>
                            <div className="text-[10px] text-slate-500 font-medium max-w-[200px] truncate" title={getGroundedDefectPartsSummary(r)}>
                              {getGroundedDefectPartsSummary(r)}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>All Parts Good</span>
                          </span>
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
                <div className="text-slate-900 font-medium text-xs mt-0.5">{formatMalaysiaDateTime(activeRecord.timestamp) || activeRecord.formattedDate}</div>
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
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-900 font-bold text-xs uppercase tracking-wider">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Defects Reported ({activeRecord.items.filter((i) => i.status === 'Fail').length} Checkpoints Failed)</span>
                  </div>
                  <span className="text-[10px] font-bold text-rose-800 bg-rose-200/80 px-2 py-0.5 rounded-full">
                    Grounded Defect Audit
                  </span>
                </div>
                <div className="space-y-2">
                  {AUDIT_CHECKPOINT_DEFS.map((cp) => {
                    const defects = getCheckpointDefects(activeRecord, cp.key);
                    if (defects.length === 0) return null;
                    return (
                      <div
                        key={cp.key}
                        className="bg-white p-3 rounded-xl border border-rose-200 text-xs space-y-1.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between border-b border-rose-100 pb-1">
                          <span className="font-bold text-slate-900 text-xs">
                            [{cp.code}] {cp.name}
                          </span>
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                            Condition: Defect
                          </span>
                        </div>
                        <div className="space-y-1 pt-0.5">
                          {defects.map((d, dIdx) => (
                            <div
                              key={dIdx}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2 rounded-lg bg-rose-50/70 border border-rose-100 text-[11px]"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded-full bg-rose-200 text-rose-800 text-[9px] font-mono flex items-center justify-center font-bold shrink-0">
                                  {dIdx + 1}
                                </span>
                                <span className="text-slate-500 font-medium">Defect Tag:</span>
                                <strong className="text-rose-900 font-bold">{d.tag}</strong>
                              </div>
                              <div className="text-slate-600 font-medium sm:text-right pl-5 sm:pl-0">
                                <span className="text-slate-400">Remark:</span>{' '}
                                <span className="text-slate-900 font-semibold">{d.remark}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
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
                          {photo && renderPhotoQaBadge(photo)}
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
                          {photo && renderPhotoQaBadge(photo)}
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
                      {dashPhoto && <div className="mt-2">{renderPhotoQaBadge(dashPhoto)}</div>}
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
                    {radPhoto && renderPhotoQaBadge(radPhoto)}

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
                    {capPhoto && renderPhotoQaBadge(capPhoto)}

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
                'brake_system',
                'lights_indicators',
                'steering_handling',
                'fluids_powertrain',
                'emergency_equipment',
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

                        // Special: For brake_system, check if fluids_powertrain had a recorded check for brake_fluid
                        if (item.id === 'brake_system') {
                          const fluidsItem = activeRecord.items?.find((i) => i.id === 'fluids_powertrain');
                          if (fluidsItem?.systemChecks && fluidsItem.systemChecks.brake_fluid !== undefined) {
                            const bfCheck = resolvedChecks.find((c) => c.key === 'brake_fluid');
                            if (bfCheck && recordedChecks['brake_fluid'] === undefined) {
                              bfCheck.checked = Boolean(fluidsItem.systemChecks.brake_fluid);
                            }
                          }
                        }

                        // Include any extra custom checks stored on the record (filter out brake from fluids_powertrain)
                        Object.entries(recordedChecks).forEach(([k, v]) => {
                          if (!configChecks.some((c) => c.key === k)) {
                            if (item.id === 'fluids_powertrain' && k.toLowerCase().includes('brake')) {
                              return;
                            }
                            resolvedChecks.push({
                              key: k,
                              label: k.replace(/_/g, ' '),
                              checked: Boolean(v),
                            });
                          }
                        });
                      } else if (Object.keys(recordedChecks).length > 0) {
                        Object.entries(recordedChecks).forEach(([k, v]) => {
                          if (item.id === 'fluids_powertrain' && k.toLowerCase().includes('brake')) {
                            return;
                          }
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
                          {photo && renderPhotoQaBadge(photo)}

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

                          {item.defectNote && (() => {
                            if (item.id === 'fluids_powertrain' && isBrakeKeyword(item.defectNote)) {
                              const nonBrake = item.defectNote
                                .split(/[;,]/)
                                .map((s) => s.trim())
                                .filter((s) => s.length > 0 && !isBrakeKeyword(s))
                                .join('; ');
                              if (!nonBrake) {
                                return (
                                  <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded font-medium">
                                    Notice: Brake remark "{item.defectNote}" relocated to Checkpoint 2 (Brake System).
                                  </div>
                                );
                              }
                              return (
                                <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded font-medium">
                                  Defect Remark: {nonBrake}
                                </div>
                              );
                            }
                            return (
                              <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded font-medium">
                                Defect Remark: {item.defectNote}
                              </div>
                            );
                          })()}

                          {!item.defectNote && item.id === 'brake_system' && (() => {
                            const fluidsItem = activeRecord.items?.find((i) => i.id === 'fluids_powertrain');
                            if (fluidsItem?.defectNote && isBrakeKeyword(fluidsItem.defectNote)) {
                              return (
                                <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded font-medium">
                                  Defect Remark: {fluidsItem.defectNote}
                                </div>
                              );
                            }
                            return null;
                          })()}
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

      {/* PHOTO LIGHTBOX MODAL WITH INTERACTIVE QA AUDIT CONTROLS */}
      {previewPhoto && (
        <div className="fixed inset-0 z-60 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="max-w-4xl w-full bg-slate-900 rounded-3xl overflow-hidden border border-slate-700 shadow-2xl space-y-4 p-4 sm:p-6 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between text-white border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-base text-slate-100">
                    {previewPhoto.itemTitle || 'Inspection Evidence Photo'}
                  </h4>
                  {previewPhoto.slotName && (
                    <span className="text-blue-400 font-bold text-xs bg-blue-950/60 border border-blue-800/60 px-2 py-0.5 rounded-md">
                      {previewPhoto.slotName}
                    </span>
                  )}
                  {activeRecord && (
                    <span className="font-mono text-xs text-slate-400">
                      • {activeRecord.vehicleNo} ({activeRecord.driverName})
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {formatMalaysiaDateTime(previewPhoto.timestamp)}
                </div>
              </div>
              <button
                onClick={() => setPreviewPhoto(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              {/* Photo Display */}
              <div className="relative rounded-2xl overflow-hidden bg-black flex items-center justify-center max-h-[46vh] border border-slate-800">
                <img
                  src={previewPhoto.url}
                  alt={previewPhoto.itemTitle || 'Inspection Photo'}
                  className="max-w-full max-h-[46vh] object-contain rounded-xl"
                  onError={(e) => handlePhotoImgError(e, previewPhoto.url)}
                />
              </div>

              {/* Watermark GPS Bar */}
              {previewPhoto.gps && (
                <div className="text-xs text-blue-300 font-mono flex items-center justify-between bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-400" />
                    <span>GPS: {typeof previewPhoto.gps.lat === 'number' ? previewPhoto.gps.lat.toFixed(5) : previewPhoto.gps.lat}°N, {typeof previewPhoto.gps.lng === 'number' ? previewPhoto.gps.lng.toFixed(5) : previewPhoto.gps.lng}°E</span>
                  </span>
                  <span className="text-[10px] text-slate-400">{previewPhoto.caption || 'Inspection Stamped'}</span>
                </div>
              )}

              {/* QA AUDIT & VERIFICATION CONTROL PANEL */}
              {activeRecord && (() => {
                const checkItem = activeRecord.items?.find((i) => i.id === previewPhoto.itemId || (i.code && previewPhoto.itemId && String(i.code) === String(previewPhoto.itemId)));
                const isFailedOrDefect = Boolean(
                  previewPhoto.isDefect ||
                  checkItem?.status === 'Fail' ||
                  (activeRecord.defects && activeRecord.defects.some((d) => d.itemId === previewPhoto.itemId || d.photoUrl === previewPhoto.url))
                );

                const isWrongPart = qaQuality === 'wrong_part';
                const isWrongPos = qaQuality === 'wrong_position';
                const isFalseAlarm = qaAccuracy === 'false_positive';
                const isFalseNegative = qaAccuracy === 'false_negative';
                const hasAnyMistake = isWrongPart || isWrongPos || isFalseAlarm || isFalseNegative;

                return (
                  <div className="bg-slate-800/95 rounded-2xl p-4 sm:p-5 border border-slate-700 space-y-4 text-slate-100 shadow-xl">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/80 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="p-1.5 rounded-lg bg-blue-600 text-white shadow-sm">
                          <ShieldCheck className="w-4 h-4" />
                        </span>
                        <div>
                          <h5 className="font-bold text-sm text-white flex items-center gap-2">
                            <span>Admin Photo Audit Decision</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-black tracking-wide ${isFailedOrDefect ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'}`}>
                              {isFailedOrDefect ? 'Failed / Defect Photo' : 'Passed Photo'}
                            </span>
                          </h5>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Default is Accurate. Click a button below if wrong to flag driver mistake.
                          </p>
                        </div>
                      </div>

                      {/* Current status pill */}
                      <div className="flex items-center gap-2">
                        {!hasAnyMistake ? (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>✓ Accurate (Default)</span>
                          </span>
                        ) : isFalseNegative ? (
                          <span className="px-2.5 py-1 rounded-xl bg-rose-500/25 border border-rose-500/50 text-rose-300 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                            <span>🚨 Missed Defect (False Neg)</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            <span>Mistake Flagged</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Button Controls Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                          {isFailedOrDefect ? 'Flag Driver Defect Mistake:' : 'Flag Driver Inspection Mistake (Passed Photo):'}
                        </label>
                        {hasAnyMistake && (
                          <button
                            type="button"
                            onClick={handleResetToAccurate}
                            className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                          >
                            Reset to Accurate (Clear Flags)
                          </button>
                        )}
                      </div>

                      {/* 3 Buttons: Passed Photo vs Failed/Defect Photo */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {/* Button 1: Wrong Spare Part */}
                        <button
                          type="button"
                          onClick={handleToggleWrongPart}
                          className={`p-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer ${
                            isWrongPart
                              ? 'bg-amber-600 text-white border-amber-400 shadow-lg shadow-amber-600/30 ring-2 ring-amber-400'
                              : 'bg-slate-900/70 text-slate-300 border-slate-700 hover:bg-slate-700/80 hover:border-amber-500/50'
                          }`}
                        >
                          <AlertTriangle className={`w-4 h-4 ${isWrongPart ? 'text-white' : 'text-amber-400'}`} />
                          <span>Wrong Spare Part</span>
                          {isWrongPart && <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded font-mono">FLAGGED</span>}
                        </button>

                        {/* Button 2: Bad Angle */}
                        <button
                          type="button"
                          onClick={handleToggleBadAngle}
                          className={`p-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer ${
                            isWrongPos
                              ? 'bg-orange-600 text-white border-orange-400 shadow-lg shadow-orange-600/30 ring-2 ring-orange-400'
                              : 'bg-slate-900/70 text-slate-300 border-slate-700 hover:bg-slate-700/80 hover:border-orange-500/50'
                          }`}
                        >
                          <Camera className={`w-4 h-4 ${isWrongPos ? 'text-white' : 'text-orange-400'}`} />
                          <span>Bad Angle</span>
                          {isWrongPos && <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded font-mono">FLAGGED</span>}
                        </button>

                        {/* Button 3 (Conditional on Passed vs Defect): */}
                        {!isFailedOrDefect ? (
                          /* For PASSED Photo: False Negative (Missed Defect - Hazard!) */
                          <button
                            type="button"
                            onClick={handleToggleFalseNegative}
                            className={`p-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer ${
                              isFalseNegative
                                ? 'bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-600/30 ring-2 ring-rose-400 animate-pulse'
                                : 'bg-slate-900/70 text-slate-300 border-slate-700 hover:bg-slate-700/80 hover:border-rose-500/50'
                            }`}
                            title="Driver marked pass, but photo clearly shows defect or safety risk!"
                          >
                            <AlertOctagon className={`w-4 h-4 ${isFalseNegative ? 'text-white' : 'text-rose-400'}`} />
                            <span>False Negative (Missed Defect)</span>
                            {isFalseNegative && <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded font-mono">FLAGGED</span>}
                          </button>
                        ) : (
                          /* For DEFECT Photo: False Alarm (Part OK - False Positive) */
                          <button
                            type="button"
                            onClick={handleToggleFalseAlarm}
                            className={`p-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer ${
                              isFalseAlarm
                                ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/30 ring-2 ring-blue-400'
                                : 'bg-slate-900/70 text-slate-300 border-slate-700 hover:bg-slate-700/80 hover:border-blue-500/50'
                            }`}
                            title="Driver reported defect, but spare part actually has NO problem"
                          >
                            <AlertOctagon className={`w-4 h-4 ${isFalseAlarm ? 'text-white' : 'text-blue-400'}`} />
                            <span>False Alarm (Part OK)</span>
                            {isFalseAlarm && <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded font-mono">FLAGGED</span>}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Optional Remarks & Coaching Note */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Audit Remarks / Coaching Note (Optional)
                        </label>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => setQaNote('Wrong spare part photographed; please capture correct component.')}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                          >
                            + Wrong Part
                          </button>
                          <button
                            type="button"
                            onClick={() => setQaNote('Camera angle too far or blurry; please retake closer.')}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                          >
                            + Bad Angle
                          </button>
                          {!isFailedOrDefect ? (
                            <button
                              type="button"
                              onClick={() => setQaNote('CRITICAL SAFETY RISK: Defect visible in photo, driver failed to report defect (False Negative).')}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800 cursor-pointer"
                            >
                              + Missed Defect (False Neg)
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setQaNote('Spare part in good condition, false alarm confirmed (False Positive).')}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/80 hover:bg-blue-900 text-blue-200 border border-blue-800 cursor-pointer"
                            >
                              + Part OK (False Alarm)
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={qaNote}
                          onChange={(e) => setQaNote(e.target.value)}
                          placeholder="Optional remarks explaining driver mistake or coaching guidance..."
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveQaDecision()}
                          disabled={isSavingQa}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                        >
                          {isSavingQa ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Save Finding</span>
                        </button>
                      </div>
                    </div>

                    {/* Footer Feedback & Quick Navigation to QA Report */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-700/80">
                      <div>
                        {qaSaveSuccess ? (
                          <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 animate-bounce">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>QA Finding Saved! Synced to Driver QA Pattern Report.</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            Buttons auto-save findings immediately to inspection record and driver QA pattern analytics.
                          </span>
                        )}
                      </div>

                      {onNavigateToQaReport && (
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewPhoto(null);
                            onNavigateToQaReport();
                          }}
                          className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Go to Driver QA Pattern Report</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Master Security Confirmation for Delete All */}
      <SecurityPasswordModal
        isOpen={showClearConfirmModal}
        title="Delete All Inspection Records"
        description="Are you sure you want to permanently delete all inspection audit records? This operation cannot be undone. All fleet vehicles will be reset to Pending Inspection."
        actionButtonText="Authorize & Delete All"
        isDestructive={true}
        onConfirm={handleConfirmClearAll}
        onClose={() => setShowClearConfirmModal(false)}
      />
        </>
      )}
    </div>
  );
};
