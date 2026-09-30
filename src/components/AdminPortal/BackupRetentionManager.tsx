import React, { useState, useEffect } from 'react';
import {
  fetchBackupStatus,
  runManualBackup,
  getBackupDownloadUrl,
  getBackupFileUrl,
  getBackupPhotoUrl,
  restoreBackupZip,
  pruneActiveDbInspections,
  BackupStatusResponse,
  DayBackupDetail,
} from '../../lib/api';
import {
  HardDrive,
  Calendar,
  Camera,
  FileText,
  Download,
  RefreshCw,
  Clock,
  ShieldCheck,
  FolderArchive,
  CheckCircle2,
  Trash2,
  FileSpreadsheet,
  Layers,
  Image as ImageIcon,
  ExternalLink,
  Eye,
  X,
  AlertCircle,
  UploadCloud,
  Database,
  ArrowDownCircle,
  Sparkles,
  Truck,
} from 'lucide-react';

export const BackupRetentionManager: React.FC = () => {
  const [status, setStatus] = useState<BackupStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const [photosCatalog, setPhotosCatalog] = useState<any[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState<boolean>(false);
  const [photoPlateFilter, setPhotoPlateFilter] = useState<string>('ALL');
  const [selectedPhoto, setSelectedPhoto] = useState<any | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreFileName, setRestoreFileName] = useState<string | null>(null);
  const [isPruning, setIsPruning] = useState<boolean>(false);
  const [isDraggingZip, setIsDraggingZip] = useState<boolean>(false);

  useEffect(() => {
    loadBackupStatus();
  }, []);

  const loadBackupStatus = async () => {
    setLoading(true);
    try {
      const data = await fetchBackupStatus();
      setStatus(data);
    } catch (err: any) {
      console.error(err);
      setActionMessage({ type: 'error', text: 'Failed to load backup status.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreZip = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setActionMessage({ type: 'error', text: 'Please select a valid .zip backup archive (e.g. backup_YYYY-MM-DD.zip).' });
      return;
    }

    setIsRestoring(true);
    setRestoreFileName(file.name);
    setActionMessage(null);

    try {
      const result = await restoreBackupZip(file);
      if (result.success) {
        setActionMessage({
          type: 'success',
          text: `Restore Complete! ${result.message || `Successfully restored records and photos into active system.`}`,
        });
        await loadBackupStatus();
      } else {
        setActionMessage({
          type: 'error',
          text: result.error || result.message || 'Failed to restore backup archive.',
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Error uploading and processing ZIP archive.',
      });
    } finally {
      setIsRestoring(false);
      setRestoreFileName(null);
    }
  };

  const handlePruneDb = async () => {
    if (!window.confirm('Are you sure you want to clean inspection records older than 45 days from the active database? All records and photos will still be permanently preserved in your 90-day C:\\ drive backups.')) {
      return;
    }

    setIsPruning(true);
    setActionMessage(null);
    try {
      const result = await pruneActiveDbInspections(45);
      if (result.success) {
        setActionMessage({
          type: 'success',
          text: result.message || `Pruned ${result.prunedCount} old inspections. Remaining active in DB: ${result.remainingCount}`,
        });
        await loadBackupStatus();
      } else {
        setActionMessage({
          type: 'error',
          text: 'Failed to prune active database.',
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Error during database auto-maintenance.',
      });
    } finally {
      setIsPruning(false);
    }
  };

  const handleRunBackup = async () => {
    setIsBackingUp(true);
    setActionMessage(null);
    try {
      const result = await runManualBackup();
      if (result.success) {
        setActionMessage({
          type: 'success',
          text: `Backup completed successfully! Saved ${result.totalPhotosSaved} photo(s) across ${result.backedUpDates.length} date folder(s). Retained ${result.retainedDays.length} day(s).`,
        });
        await loadBackupStatus();
      } else {
        setActionMessage({
          type: 'error',
          text: result.error || 'Failed to complete daily backup.',
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Error executing backup engine.',
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const openPhotosModal = async (date: string) => {
    setPreviewDate(date);
    setLoadingPhotos(true);
    setPhotosCatalog([]);
    setPhotoPlateFilter('ALL');
    try {
      const res = await fetch(getBackupFileUrl(date, 'photos_catalog.json'));
      if (res.ok) {
        const data = await res.json();
        setPhotosCatalog(Array.isArray(data) ? data : []);
      } else {
        setPhotosCatalog([]);
      }
    } catch (err) {
      console.error(err);
      setPhotosCatalog([]);
    } finally {
      setLoadingPhotos(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Storage Destination & Retention Policy */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                <HardDrive className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Automated 90-Day Rolling Backup & 45-Day DB Lifecycle
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              High-throughput architecture for <span className="font-semibold text-slate-700">500 vehicles/day</span>: active DB maintains 45 days of inspections, while full daily archives & photos are preserved for 90 days in Windows C:\ drive (Day 91 auto-purged).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRunBackup}
              disabled={isBackingUp}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isBackingUp ? 'animate-spin' : ''}`} />
              <span>{isBackingUp ? 'Backing Up...' : 'Run Backup Now'}</span>
            </button>

            <button
              type="button"
              onClick={handlePruneDb}
              disabled={isPruning}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Clean records older than 45 days from active DB"
            >
              <Database className={`w-3.5 h-3.5 ${isPruning ? 'animate-spin text-amber-600' : 'text-slate-600'}`} />
              <span>{isPruning ? 'Cleaning...' : 'Prune DB (>45d)'}</span>
            </button>

            <button
              type="button"
              onClick={loadBackupStatus}
              disabled={loading}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition cursor-pointer"
              title="Refresh Status"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
              <span>BACKUP STORAGE PATH</span>
              <HardDrive className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xs font-mono font-bold text-slate-800 break-all">
              {status?.backupRootDir || 'C:\\FleetInspection_Backup'}
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Dedicated Windows C:\ Drive</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
              <span>BACKUP RETENTION</span>
              <Calendar className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-sm font-bold text-slate-900">
              90-Day Rolling Policy
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Day 91 is automatically purged to protect storage.
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
              <span>ACTIVE DB LIFECYCLE</span>
              <Database className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-sm font-bold text-slate-900">
              45-Day Auto-Clean
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Keeps active JSON DB under 15MB at 500 trucks/day.
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
              <span>RETAINED ON DISK</span>
              <Layers className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-sm font-bold text-slate-900">
              {status?.existingDays?.length || 0} of 90 Days Retained
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {status?.lastBackupTime
                ? `Last run: ${new Date(status.lastBackupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Pending initial run'}
            </div>
          </div>
        </div>

        {actionMessage && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
              actionMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{actionMessage.text}</span>
          </div>
        )}
      </div>

      {/* Upload Backup ZIP to Restore Day Data Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <UploadCloud className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Upload Backup ZIP to Restore Day Data
              </h3>
              <p className="text-xs text-slate-500">
                Upload any daily backup ZIP archive (e.g. <code className="text-indigo-600 font-mono">fleet_backup_YYYY-MM-DD.zip</code>). The system will safely merge the inspection records, defects, and restore photo evidence files directly into the active database.
              </p>
            </div>
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingZip(true);
          }}
          onDragLeave={() => setIsDraggingZip(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingZip(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleRestoreZip(e.dataTransfer.files[0]);
            }
          }}
          className={`mt-3 border-2 border-dashed rounded-xl p-6 text-center transition-all ${
            isDraggingZip
              ? 'border-indigo-500 bg-indigo-50/50 scale-[1.005]'
              : 'border-slate-200 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/20'
          }`}
        >
          {isRestoring ? (
            <div className="py-4 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
              <div className="text-xs font-bold text-slate-800">
                Restoring data from <span className="font-mono text-indigo-600">{restoreFileName}</span>...
              </div>
              <p className="text-[11px] text-slate-500">
                Extracting inspections and photo evidence files to server disk. Please wait...
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2">
              <UploadCloud className="w-8 h-8 text-indigo-500" />
              <div className="text-xs font-bold text-slate-700">
                Drag and drop your backup <span className="font-mono text-indigo-600">.zip</span> here, or click to browse
              </div>
              <p className="text-[11px] text-slate-400 max-w-md">
                Safe day restore: Merges inspections and photos into the active database without wiping out or corrupting subsequent dates.
              </p>
              <label className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer">
                <FolderArchive className="w-4 h-4" />
                <span>Select Backup ZIP File</span>
                <input
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleRestoreZip(e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Date-by-Date Backup Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <FolderArchive className="w-4 h-4 text-blue-600" />
            <span>Date Backup Archives (Rolling 90 Days)</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            Auto-pruned on Day 91
          </span>
        </div>

        {loading && !status ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs">
            Loading backup records...
          </div>
        ) : !status?.existingDays || status.existingDays.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
            <FolderArchive className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-sm font-bold text-slate-700">No Date Backups Found Yet</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Click &quot;Run Backup Now&quot; above to immediately create today&apos;s date backup containing inspection records, audit logs, and decoded checkpoint photos.
            </p>
            <button
              type="button"
              onClick={handleRunBackup}
              disabled={isBackingUp}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition cursor-pointer"
            >
              Generate First Backup
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {status.existingDays.map((day: DayBackupDetail, index: number) => {
              const isToday = day.date === new Date().toISOString().slice(0, 10);
              return (
                <div
                  key={day.date}
                  className={`bg-white border rounded-2xl p-5 shadow-sm transition hover:border-slate-300 ${
                    isToday ? 'border-blue-300 ring-2 ring-blue-500/10' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Date and Status Badge */}
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          isToday
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        D{index + 1}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-slate-900 font-mono">
                            {day.date}
                          </span>
                          {isToday && (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-black uppercase">
                              Today / Active
                            </span>
                          )}
                          <span className="text-xs text-slate-400 font-mono">
                            ({day.totalSizeKb} KB)
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono">
                          Folder: {day.folderName}
                        </div>
                      </div>
                    </div>

                    {/* Content Metrics */}
                    <div className="grid grid-cols-3 gap-3 sm:gap-6 bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 flex items-center justify-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-blue-500" />
                          <span>Inspections</span>
                        </div>
                        <div className="text-sm font-black text-slate-900 mt-0.5">
                          {day.inspectionsCount}
                        </div>
                      </div>

                      <div className="border-x border-slate-200 px-3">
                        <div className="text-xs font-semibold text-slate-500 flex items-center justify-center gap-1">
                          <Camera className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Photos</span>
                        </div>
                        <div className="text-sm font-black text-slate-900 mt-0.5">
                          {day.photosCount}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-slate-500 flex items-center justify-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
                          <span>Audit Logs</span>
                        </div>
                        <div className="text-sm font-black text-slate-900 mt-0.5">
                          {day.auditLogsCount}
                        </div>
                      </div>
                    </div>

                    {/* Action Download Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* View Photos Button */}
                      {day.photosCount > 0 && (
                        <button
                          type="button"
                          onClick={() => openPhotosModal(day.date)}
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View {day.photosCount} Photos</span>
                        </button>
                      )}

                      {/* Download Inspection CSV */}
                      <a
                        href={getBackupFileUrl(day.date, `inspections_${day.date}.csv`)}
                        download
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                        title="Download Inspection CSV for Excel"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                        <span>Inspections.csv</span>
                      </a>

                      {/* Download Audit Log CSV */}
                      <a
                        href={getBackupFileUrl(day.date, `audit_logs_${day.date}.csv`)}
                        download
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                        title="Download Audit Logs CSV"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />
                        <span>AuditLogs.csv</span>
                      </a>

                      {/* Download Full Day ZIP */}
                      <a
                        href={getBackupDownloadUrl(day.date)}
                        download
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                        title="Download complete Day archive (ZIP)"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Full ZIP</span>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Photos Modal Preview */}
      {previewDate && (() => {
        const platesInCatalog = Array.from(new Set(photosCatalog.map((p) => p.vehicleNo || 'Unknown')));
        const filteredPhotosCatalog = photoPlateFilter === 'ALL'
          ? photosCatalog
          : photosCatalog.filter((p) => (p.vehicleNo || 'Unknown') === photoPlateFilter);

        const photosGroupedByPlate = filteredPhotosCatalog.reduce((acc: Record<string, any[]>, p) => {
          const plate = p.vehicleNo || 'Unknown';
          if (!acc[plate]) acc[plate] = [];
          acc[plate].push(p);
          return acc;
        }, {});

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                    <Camera className="w-5 h-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-extrabold text-slate-900">
                        Photo Evidence Archive • {previewDate}
                      </h3>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-bold">
                        {photosCatalog.length} Total Photos
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      Hierarchy: upload/{previewDate}/[CAR_PLATE]/ (10 Checkpoint Inspection Photos)
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {/* Vehicle Plate Filter */}
                  {platesInCatalog.length > 1 && (
                    <select
                      value={photoPlateFilter}
                      onChange={(e) => setPhotoPlateFilter(e.target.value)}
                      className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-1.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                    >
                      <option value="ALL">All Trucks ({platesInCatalog.length})</option>
                      {platesInCatalog.map((plate) => (
                        <option key={plate} value={plate}>
                          {plate}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => setPreviewDate(null)}
                    className="p-2 hover:bg-slate-200 rounded-xl text-slate-500 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                {loadingPhotos ? (
                  <div className="py-16 text-center text-xs text-slate-400 space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                    <p>Loading photo evidence archive...</p>
                  </div>
                ) : photosCatalog.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-500 space-y-2">
                    <Camera className="w-8 h-8 mx-auto text-slate-300" />
                    <p>No photos catalog index found for this backup date.</p>
                  </div>
                ) : (
                  (Object.entries(photosGroupedByPlate) as [string, any[]][]).map(([plate, platePhotos]) => (
                    <div
                      key={plate}
                      className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-3.5 shadow-xs"
                    >
                      {/* Vehicle Plate Banner */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/90 pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                            <Truck className="w-4 h-4" />
                          </span>
                          <div>
                            <span className="font-mono font-extrabold text-sm text-slate-900 tracking-wide">
                              {plate}
                            </span>
                            <span className="ml-2 text-xs text-slate-500">
                              Driver: <strong className="text-slate-800">{platePhotos[0]?.driverName || 'Assigned Driver'}</strong>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                            {platePhotos.length} Checkpoint Photos
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono hidden sm:inline bg-white px-2 py-0.5 rounded border border-slate-200">
                            upload/{previewDate}/{plate}/
                          </span>
                        </div>
                      </div>

                      {/* 10 Photos Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {platePhotos.map((p, idx) => {
                          const photoUrl = getBackupPhotoUrl(
                            previewDate,
                            p.relativePath || p.filePath || `${p.vehicleNo}/${p.fileName}` || p.fileName
                          );
                          return (
                            <div
                              key={idx}
                              className="bg-white border border-slate-200 rounded-xl overflow-hidden group hover:shadow-md hover:border-blue-300 transition flex flex-col"
                            >
                              <div className="aspect-square bg-slate-900 relative flex items-center justify-center overflow-hidden">
                                <img
                                  src={photoUrl}
                                  alt={p.itemTitle || p.fileName}
                                  className="object-cover w-full h-full group-hover:scale-105 transition duration-300"
                                  onError={(e: any) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setSelectedPhoto(p)}
                                  className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition cursor-pointer"
                                  title="Zoom Preview"
                                >
                                  <Eye className="w-5 h-5" />
                                </button>
                              </div>
                              <div className="p-2.5 text-xs flex-1 flex flex-col justify-between space-y-1">
                                <div>
                                  <div className="font-bold text-slate-800 text-[11px] truncate" title={p.itemTitle || p.itemId}>
                                    {p.itemTitle || p.itemId}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono truncate" title={p.fileName}>
                                    {p.fileName}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-100">
                                  <span>{p.fileSizeKb || 0} KB</span>
                                  <a
                                    href={photoUrl}
                                    download={p.fileName}
                                    className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-0.5"
                                    title="Download JPG"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>JPG</span>
                                  </a>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-mono truncate mr-2">
                  Location: {status?.backupRootDir}\backup_{previewDate}\upload\{previewDate}\[CAR_PLATE]\
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewDate(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer flex-shrink-0"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Individual Photo Lightbox Modal */}
      {selectedPhoto && previewDate && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-3xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between text-white">
              <div>
                <div className="font-bold text-sm">
                  {selectedPhoto.vehicleNo} • {selectedPhoto.itemTitle}
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  Driver: {selectedPhoto.driverName} • {selectedPhoto.fileName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-black flex items-center justify-center max-h-[70vh]">
              <img
                src={getBackupPhotoUrl(
                  previewDate,
                  selectedPhoto.relativePath || selectedPhoto.filePath || `${selectedPhoto.vehicleNo}/${selectedPhoto.fileName}` || selectedPhoto.fileName
                )}
                alt={selectedPhoto.fileName}
                className="max-h-[65vh] object-contain rounded-lg"
              />
            </div>
            <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950 text-xs">
              <span className="text-slate-400 font-mono truncate mr-2">
                upload/{previewDate}/{selectedPhoto.vehicleNo}/{selectedPhoto.fileName}
              </span>
              <a
                href={getBackupPhotoUrl(
                  previewDate,
                  selectedPhoto.relativePath || selectedPhoto.filePath || `${selectedPhoto.vehicleNo}/${selectedPhoto.fileName}` || selectedPhoto.fileName
                )}
                download={selectedPhoto.fileName}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1.5 transition flex-shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download JPG</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
