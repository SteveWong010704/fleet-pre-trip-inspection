import React, { useState, useEffect, useMemo } from 'react';
import { AuditLog } from '../../types';
import { fetchAuditLogs } from '../../lib/api';
import {
  Server,
  Database,
  HardDrive,
  RefreshCw,
  Search,
  Filter,
  RotateCcw,
  Download,
  Calendar,
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Terminal,
} from 'lucide-react';

interface SystemLogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'HTTP' | 'DEBUG';
  tag: string;
  message: string;
  meta?: any;
}

export const AuditLogViewer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'audit' | 'system'>('audit');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [systemLoading, setSystemLoading] = useState<boolean>(false);

  // Filters for Audit Logs
  const [search, setSearch] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [timeFrom, setTimeFrom] = useState<string>('');
  const [timeTo, setTimeTo] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');

  // System logs filter
  const [systemLevelFilter, setSystemLevelFilter] = useState<string>('ALL');

  // Pagination for smooth bounded scrolling
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    loadAuditLogs();
    loadSystemLogs();
  }, []);

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const list = await fetchAuditLogs();
      setLogs(list);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSystemLogs = async () => {
    setSystemLoading(true);
    try {
      const res = await fetch('/api/system/logs?limit=200');
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setSystemLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to load system logs:', err);
    } finally {
      setSystemLoading(false);
    }
  };

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Text Search (operator, IP, eventType, details)
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matches =
          (log.operator && log.operator.toLowerCase().includes(q)) ||
          (log.ip && log.ip.toLowerCase().includes(q)) ||
          (log.eventType && log.eventType.toLowerCase().includes(q)) ||
          (log.details && log.details.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // 2. Severity
      if (severityFilter !== 'ALL' && log.severity !== severityFilter) {
        return false;
      }

      // Parse log date and time
      const logDateObj = new Date(log.timestamp);
      if (isNaN(logDateObj.getTime())) return true;

      // Extract local YYYY-MM-DD and HH:mm
      const year = logDateObj.getFullYear();
      const month = String(logDateObj.getMonth() + 1).padStart(2, '0');
      const day = String(logDateObj.getDate()).padStart(2, '0');
      const logDateStr = `${year}-${month}-${day}`;

      const hours = String(logDateObj.getHours()).padStart(2, '0');
      const minutes = String(logDateObj.getMinutes()).padStart(2, '0');
      const logTimeStr = `${hours}:${minutes}`;

      // 3. Date Range Filter
      if (dateFrom && logDateStr < dateFrom) return false;
      if (dateTo && logDateStr > dateTo) return false;

      // 4. Time Range Filter (e.g. 08:00 to 17:00)
      if (timeFrom && logTimeStr < timeFrom) return false;
      if (timeTo && logTimeStr > timeTo) return false;

      return true;
    });
  }, [logs, search, severityFilter, dateFrom, dateTo, timeFrom, timeTo]);

  // Filtered System Logs
  const filteredSystemLogs = useMemo(() => {
    return systemLogs.filter((l) => {
      if (systemLevelFilter !== 'ALL' && l.level !== systemLevelFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          l.tag.toLowerCase().includes(q) ||
          l.message.toLowerCase().includes(q) ||
          l.timestamp.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [systemLogs, systemLevelFilter, search]);

  // Reset Audit Filters
  const resetFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setTimeFrom('');
    setTimeTo('');
    setSeverityFilter('ALL');
    setCurrentPage(1);
  };

  // Export filtered audit logs to CSV
  const exportCsv = () => {
    if (filteredAuditLogs.length === 0) return;
    const headers = ['Timestamp', 'Event Type', 'Severity', 'Operator', 'IP Address', 'Details'];
    const rows = filteredAuditLogs.map((l) => [
      `"${new Date(l.timestamp).toLocaleString()}"`,
      `"${l.eventType || ''}"`,
      `"${l.severity || 'info'}"`,
      `"${(l.operator || '').replace(/"/g, '""')}"`,
      `"${l.ip || ''}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Paginated records for bounded scroll view
  const totalPages = Math.ceil(filteredAuditLogs.length / pageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAuditLogs.slice(start, start + pageSize);
  }, [filteredAuditLogs, currentPage, pageSize]);

  return (
    <div className="space-y-6">
      {/* Telemetry Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-slate-800 space-y-2 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Core Server Engine</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <Server className="w-5 h-5" />
            </div>
          </div>
          <div className="text-lg font-black font-mono text-emerald-600 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span>Online (Port 3000)</span>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Logs: <span className="text-emerald-700 font-bold">Active File & Console Logging</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-slate-800 space-y-2 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Audit Storage Engine</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <Database className="w-5 h-5" />
            </div>
          </div>
          <div className="text-lg font-black font-mono text-slate-900">{logs.length} Audit Records</div>
          <div className="text-xs text-slate-500">Non-blocking async disk sync</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-slate-800 space-y-2 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Photo Evidence Folder</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
              <HardDrive className="w-5 h-5" />
            </div>
          </div>
          <div className="text-lg font-black font-mono text-amber-600">/uploads Directory</div>
          <div className="text-xs text-slate-500">Full 5-Tyre & 4-Body Photos Backed Up</div>
        </div>
      </div>

      {/* Main Audit & Log Viewer Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-slate-800 space-y-4">
        {/* Header & Mode Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <span>Security Audit Logs & Telemetry Trail</span>
              <span className="text-xs font-mono font-normal bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                {filteredAuditLogs.length} Records
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Tamper-evident system activity log, driver logins, submissions, and diagnostics
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {/* Tab switch between Audit Trail and Server Console Logs */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  activeTab === 'audit'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Audit Records
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('system');
                  loadSystemLogs();
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
                  activeTab === 'system'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Server System Logs</span>
              </button>
            </div>

            {activeTab === 'audit' ? (
              <>
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={filteredAuditLogs.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition disabled:opacity-50 cursor-pointer"
                  title="Export to CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
                <button
                  type="button"
                  onClick={loadAuditLogs}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer shadow-xs"
                  title="Refresh Audit Logs"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
                </button>
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <a
                  href="/api/system/logs/download?type=app"
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                  title="Download foms.log file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download foms.log</span>
                </a>
                <button
                  type="button"
                  onClick={loadSystemLogs}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer shadow-xs"
                  title="Refresh System Logs"
                >
                  <RefreshCw className={`w-4 h-4 ${systemLoading ? 'animate-spin text-blue-600' : ''}`} />
                </button>
              </div>
            )}
          </div>
        </div>

        {activeTab === 'audit' ? (
          <>
            {/* Filter Controls: Date, Time, Severity, Search */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
              {/* Date Range: From */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-blue-500" />
                  <span>From Date</span>
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-white border border-slate-300 text-xs text-slate-800 px-2.5 py-1.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Date Range: To */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-blue-500" />
                  <span>To Date</span>
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-white border border-slate-300 text-xs text-slate-800 px-2.5 py-1.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Time Range: From */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-500" />
                  <span>From Time</span>
                </label>
                <input
                  type="time"
                  value={timeFrom}
                  onChange={(e) => {
                    setTimeFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-white border border-slate-300 text-xs text-slate-800 px-2.5 py-1.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Time Range: To */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-500" />
                  <span>To Time</span>
                </label>
                <input
                  type="time"
                  value={timeTo}
                  onChange={(e) => {
                    setTimeTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-white border border-slate-300 text-xs text-slate-800 px-2.5 py-1.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Severity Filter */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase">
                  Severity Level
                </label>
                <select
                  value={severityFilter}
                  onChange={(e) => {
                    setSeverityFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-white border border-slate-300 text-xs text-slate-800 px-2.5 py-1.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="ALL">All Severities</option>
                  <option value="danger">Danger / Alert</option>
                  <option value="warning">Warning</option>
                  <option value="success">Success</option>
                  <option value="info">Info</option>
                </select>
              </div>

              {/* Text Search */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase">
                  Search
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Operator, IP, event..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Active Filter Bar & Reset */}
            {(search || dateFrom || dateTo || timeFrom || timeTo || severityFilter !== 'ALL') && (
              <div className="flex items-center justify-between bg-blue-50/80 border border-blue-200/80 px-3.5 py-2 rounded-xl text-xs text-blue-900">
                <div className="flex items-center space-x-2">
                  <Filter className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    Filtered Audit Trail: <strong>{filteredAuditLogs.length}</strong> of {logs.length} records match.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex items-center space-x-1 text-blue-700 hover:text-blue-900 font-bold hover:underline cursor-pointer text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All Filters</span>
                </button>
              </div>
            )}

            {/* Bounded Scrollable Table Container: max-h-[560px] with sticky header */}
            <div className="overflow-x-auto overflow-y-auto max-h-[560px] rounded-xl border border-slate-200 shadow-inner bg-white">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200 text-[11px] shadow-xs">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Timestamp</th>
                    <th className="px-4 py-3 whitespace-nowrap">Event Type</th>
                    <th className="px-4 py-3 whitespace-nowrap">Operator / Source</th>
                    <th className="px-4 py-3 whitespace-nowrap">IP Address</th>
                    <th className="px-4 py-3">Audit Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-sans">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                        <span>Loading audit records...</span>
                      </td>
                    </tr>
                  ) : filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-sans">
                        <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <span>No audit records match the specified date/time and filter criteria.</span>
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/90 transition">
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap font-medium">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.severity === 'danger'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : log.severity === 'success'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : log.severity === 'warning'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {log.eventType}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-900 font-sans font-bold whitespace-nowrap">
                          {log.operator}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap font-mono">
                          {log.ip}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 font-sans break-words max-w-xl">
                          {log.details}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls & Item Info */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-2">
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
                    {filteredAuditLogs.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} -{' '}
                    {Math.min(currentPage * pageSize, filteredAuditLogs.length)}
                  </strong>{' '}
                  of <strong>{filteredAuditLogs.length}</strong>
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
          </>
        ) : (
          /* System Server Console & Error Logs View */
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 bg-slate-900 text-slate-200 p-3.5 rounded-xl">
              <div className="flex items-center space-x-3">
                <Terminal className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-xs font-bold text-white font-mono">Live Server Logs (foms.log & error.log)</div>
                  <div className="text-[11px] text-slate-400">
                    Captures all HTTP requests, duration, background jobs, and error stack traces
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={systemLevelFilter}
                  onChange={(e) => setSystemLevelFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-xs text-white px-2.5 py-1.5 rounded-lg focus:outline-none"
                >
                  <option value="ALL">All Levels</option>
                  <option value="ERROR">ERROR only</option>
                  <option value="WARN">WARN only</option>
                  <option value="HTTP">HTTP only</option>
                  <option value="INFO">INFO only</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[560px] rounded-xl bg-slate-950 p-4 border border-slate-800 font-mono text-xs shadow-inner">
              {systemLoading ? (
                <div className="py-12 text-center text-slate-400 font-sans">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                  <span>Loading server system logs...</span>
                </div>
              ) : filteredSystemLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-500 font-sans">
                  No system log entries recorded yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredSystemLogs.map((entry, idx) => {
                    const isErr = entry.level === 'ERROR';
                    const isWarn = entry.level === 'WARN';
                    const isHttp = entry.level === 'HTTP';
                    return (
                      <div
                        key={idx}
                        className={`leading-relaxed whitespace-pre-wrap ${
                          isErr
                            ? 'text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-900/50'
                            : isWarn
                            ? 'text-amber-300'
                            : isHttp
                            ? 'text-cyan-300'
                            : 'text-slate-300'
                        }`}
                      >
                        <span className="text-slate-500">[{entry.timestamp}]</span>{' '}
                        <span
                          className={`font-bold ${
                            isErr
                              ? 'text-rose-400'
                              : isWarn
                              ? 'text-amber-400'
                              : isHttp
                              ? 'text-cyan-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          [{entry.level}]
                        </span>{' '}
                        <span className="text-purple-400 font-semibold">[{entry.tag}]</span>{' '}
                        <span>{entry.message}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
