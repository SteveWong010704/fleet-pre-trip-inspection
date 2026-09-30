import React, { useState, useEffect } from 'react';
import { Driver, Vehicle, InspectionCheckItem, InspectionPhoto, InspectionRecord, STANDARD_10_POINT_ITEMS, AdminUser } from './types';
import { Navbar } from './components/Navbar';
import { DriverAuth } from './components/DriverApp/DriverAuth';
import { VehicleScanner } from './components/DriverApp/VehicleScanner';
import { Checklist10Points } from './components/DriverApp/Checklist10Points';
import { DeclarationAndSubmit } from './components/DriverApp/DeclarationAndSubmit';
import { InspectionCertificate } from './components/DriverApp/InspectionCertificate';
import { AdminAuth } from './components/AdminPortal/AdminAuth';
import { FleetOverview } from './components/AdminPortal/FleetOverview';
import { DriverManagement } from './components/AdminPortal/DriverManagement';
import { InspectionHistory } from './components/AdminPortal/InspectionHistory';
import { BulkManager } from './components/AdminPortal/BulkManager';
import { QrCodeGenerator } from './components/AdminPortal/QrCodeGenerator';
import { AuditLogViewer } from './components/AdminPortal/AuditLogViewer';
import { BackupRetentionManager } from './components/AdminPortal/BackupRetentionManager';
import { fetchVehicleByPlate, checkDriverDailyInspection, checkVehicleDailyInspection, clearAuthToken } from './lib/api';
import { syncPublicBaseUrlFromServer } from './lib/publicUrl';
import { getCheckpointRequiredPhotoCount } from './lib/checkpointConfig';
import { getDefaultSystemChecks } from './lib/quickChecklistConfig';
import { Smartphone, LayoutDashboard, Truck, ClipboardList, Send, FileCheck, ArrowLeft, ArrowRight, ShieldCheck, Users, AlertTriangle, HardDrive } from 'lucide-react';

export default function App() {
  // Check if opened from a Driver QR code scan (?plate=XXX or ?view=driver or ?certId=XXX)
  const isDriverQrScan = () => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get('plate') || params.get('certId') || params.get('view') === 'driver');
  };

  // Direct link / 192.168.1.80 defaults directly to ADMIN login. Only QR code scans default to DRIVER login.
  const [currentView, setCurrentView] = useState<'driver' | 'admin'>(() => {
    return isDriverQrScan() ? 'driver' : 'admin';
  });
  const [adminTab, setAdminTab] = useState<'fleet' | 'drivers' | 'history' | 'bulk' | 'qr' | 'logs' | 'backup'>('fleet');

  // Admin Auth State (session persisted so refresh on 192.168.1.80 maintains admin session)
  const [activeAdmin, setActiveAdmin] = useState<AdminUser | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('FLEET_ACTIVE_ADMIN');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return null;
  });

  // Driver App State
  const [activeDriver, setActiveDriver] = useState<Driver | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [driverStep, setDriverStep] = useState<'auth' | 'scanner' | 'checklist' | 'declaration' | 'certificate'>('auth');
  
  // Checklist State helper to ensure systemChecks and dashboardChecks are initialized
  const createInitialChecklist = (veh?: Vehicle | null): InspectionCheckItem[] => {
    const isFeeder = veh
      ? veh.truckCategory === 'Feeder' || String(veh.model || '').toLowerCase().includes('feeder')
      : false;

    return STANDARD_10_POINT_ITEMS.map((item) => ({
      ...item,
      status: 'Pass' as const,
      dashboardChecks:
        item.id === 'dashboard_warnings'
          ? {
              engineLightOff: true,
              doubleSignalOk: true,
              batteryLightOff: true,
              oilLightOff: true,
            }
          : undefined,
      systemChecks: getDefaultSystemChecks(item.id, isFeeder),
    }));
  };

  const [checklistItems, setChecklistItems] = useState<InspectionCheckItem[]>(() =>
    createInitialChecklist(null)
  );
  const [photos, setPhotos] = useState<InspectionPhoto[]>([]);
  const [completedRecord, setCompletedRecord] = useState<InspectionRecord | null>(null);
  const [photoAlertMessage, setPhotoAlertMessage] = useState<string>('');

  const handleProceedToDeclaration = () => {
    // Check if every checkpoint has satisfied its photo requirement
    for (const item of checklistItems) {
      const required = getCheckpointRequiredPhotoCount(item.id);
      const count = photos.filter(p => p.itemId === item.id).length;
      if (count < required) {
        setPhotoAlertMessage(`Checkpoint #${item.code} (${item.title}) requires ${required} photo(s). Currently taken: ${count}`);
        return;
      }
    }

    // Check dashboard check answers
    const dashItem = checklistItems.find(i => i.id === 'dashboard_warnings');
    if (dashItem) {
      if (dashItem.status === 'Fail' && (!dashItem.defectNote || !dashItem.defectNote.trim())) {
        setPhotoAlertMessage('Dashboard checkpoint is marked as Defect (Fail). Please enter a defect remark.');
        return;
      }
    }

    setPhotoAlertMessage('');
    setDriverStep('declaration');
  };

  // Sync public ngrok URL from server & Deep-link check for QR code scanning (?plate=XXX)
  useEffect(() => {
    // Sync public base URL (e.g. ngrok tunnel domain)
    syncPublicBaseUrlFromServer().catch(() => {});

    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const plateParam = urlParams.get('plate');
    const certIdParam = urlParams.get('certId');

    // If driver scanned a vehicle QR code with plate or certId
    if (plateParam || certIdParam || viewParam === 'driver') {
      setCurrentView('driver');
      setDriverStep('auth');
      if (plateParam) {
        fetchVehicleByPlate(plateParam).then((v) => {
          if (v) {
            setSelectedVehicle(v);
          }
        }).catch(() => {});
      }
    } else {
      // Direct access (e.g. http://192.168.1.80:3000/ or root link)
      setCurrentView('admin');
    }
  }, []);

  // Driver Auth Handler
  const handleDriverAuthenticated = async (driver: Driver) => {
    // 1. Check if driver has already completed daily inspection
    try {
      const dCheck = await checkDriverDailyInspection(driver.loginId);
      if (dCheck.hasInspectedToday && dCheck.inspection) {
        setActiveDriver(driver);
        setCompletedRecord(dCheck.inspection);
        setDriverStep('certificate');
        return;
      }
    } catch {}

    // 2. If vehicle was bound via QR scan, check if vehicle has already been inspected today
    if (selectedVehicle) {
      try {
        const vCheck = await checkVehicleDailyInspection(selectedVehicle.vehicleNo);
        if (vCheck.hasInspectedToday && vCheck.inspection) {
          setActiveDriver(driver);
          setCompletedRecord(vCheck.inspection);
          setDriverStep('certificate');
          return;
        }
      } catch {}
    }

    setActiveDriver(driver);
    setDriverStep(selectedVehicle ? 'checklist' : 'scanner');
  };

  const handleDriverLogout = () => {
    clearAuthToken();
    setActiveDriver(null);
    setSelectedVehicle(null);
    setCompletedRecord(null);
    setDriverStep('auth');
  };

  const handleAdminAuthenticated = (admin: AdminUser) => {
    setActiveAdmin(admin);
    try {
      sessionStorage.setItem('FLEET_ACTIVE_ADMIN', JSON.stringify(admin));
    } catch {}
  };

  const handleAdminLogout = () => {
    clearAuthToken();
    setActiveAdmin(null);
    try {
      sessionStorage.removeItem('FLEET_ACTIVE_ADMIN');
    } catch {}
  };

  const handleVehicleSelected = async (vehicle: Vehicle) => {
    try {
      const vCheck = await checkVehicleDailyInspection(vehicle.vehicleNo);
      if (vCheck.hasInspectedToday && vCheck.inspection) {
        setSelectedVehicle(vehicle);
        setCompletedRecord(vCheck.inspection);
        setDriverStep('certificate');
        return;
      }
    } catch {}

    setSelectedVehicle(vehicle);
    setChecklistItems(createInitialChecklist(vehicle));
    setPhotos([]);
    setDriverStep('checklist');
  };

  const handleInspectionFinished = (record: InspectionRecord) => {
    setCompletedRecord(record);
    setDriverStep('certificate');
  };

  const handleStartNewInspection = () => {
    setSelectedVehicle(null);
    setCompletedRecord(null);
    setPhotos([]);
    setChecklistItems(createInitialChecklist(null));
    setDriverStep('scanner');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-blue-500 selection:text-white w-full max-w-full overflow-x-hidden">
      {/* Header Bar */}
      <Navbar
        currentView={currentView}
        onViewChange={(v) => setCurrentView(v)}
        activeDriver={activeDriver}
        onDriverLogout={handleDriverLogout}
        activeAdmin={activeAdmin}
        onAdminLogout={handleAdminLogout}
        boundVehicle={selectedVehicle}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 overflow-x-hidden">
        {currentView === 'driver' ? (
          /* ================= DRIVER INSPECTION APP ================= */
          <div className="space-y-4 sm:space-y-6">
            {/* Step Navigation Indicator (Shown during scanner and declaration) */}
            {activeDriver && driverStep !== 'certificate' && driverStep !== 'checklist' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm max-w-2xl mx-auto text-xs">
                {/* Mobile Compact Step Header */}
                <div className="sm:hidden flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                      {driverStep === 'scanner' ? '1' : driverStep === 'checklist' ? '2' : '3'}
                    </span>
                    <span className="font-bold text-slate-900 text-xs">
                      {driverStep === 'scanner'
                        ? 'Step 1: Vehicle Assignment'
                        : driverStep === 'checklist'
                        ? 'Step 2: 10-Point Card Inspection'
                        : 'Step 3: Meter & Declaration'}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {driverStep === 'scanner' ? '1/3' : driverStep === 'checklist' ? '2/3' : '3/3'}
                  </span>
                </div>

                {/* Desktop/Tablet Stepper */}
                <div className="hidden sm:flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold transition ${
                      driverStep === 'scanner' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30' : 'bg-slate-100 text-slate-500'
                    }`}>
                      1
                    </span>
                    <span className={driverStep === 'scanner' ? 'font-bold text-blue-600' : 'text-slate-500 font-medium'}>
                      Step 1: Vehicle QR Scan
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300" />
                  <div className="flex items-center space-x-2">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold transition ${
                      driverStep === 'checklist' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30' : 'bg-slate-100 text-slate-500'
                    }`}>
                      2
                    </span>
                    <span className={driverStep === 'checklist' ? 'font-bold text-blue-600' : 'text-slate-500 font-medium'}>
                      Step 2: 10-Point Card Inspection (10 Cards)
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300" />
                  <div className="flex items-center space-x-2">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold transition ${
                      driverStep === 'declaration' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30' : 'bg-slate-100 text-slate-500'
                    }`}>
                      3
                    </span>
                    <span className={driverStep === 'declaration' ? 'font-bold text-blue-600' : 'text-slate-500 font-medium'}>
                      Step 3: Meter & Declaration
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Authentication */}
            {driverStep === 'auth' && (
              <DriverAuth
                onAuthenticated={handleDriverAuthenticated}
                activeDriver={activeDriver}
                boundVehicle={selectedVehicle}
                onViewCertificate={(record) => {
                  setCompletedRecord(record);
                  setDriverStep('certificate');
                }}
              />
            )}

            {/* Step 2: Vehicle Selection & QR Scanner */}
            {driverStep === 'scanner' && activeDriver && (
              <div className="space-y-4">
                <VehicleScanner
                  activeDriver={activeDriver}
                  onVehicleSelected={handleVehicleSelected}
                  selectedVehicle={selectedVehicle}
                  onViewCertificate={(record) => {
                    setCompletedRecord(record);
                    setDriverStep('certificate');
                  }}
                />
              </div>
            )}

            {/* Step 3: 10-Point Safety Checklist */}
            {driverStep === 'checklist' && activeDriver && selectedVehicle && (
              <div className="space-y-4">
                {photoAlertMessage && (
                  <div className="max-w-3xl mx-auto p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs font-bold flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>{photoAlertMessage}</span>
                    </div>
                    <button
                      onClick={() => setPhotoAlertMessage('')}
                      className="text-amber-700 hover:text-amber-900 font-bold ml-2 cursor-pointer p-1"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <Checklist10Points
                  vehicle={selectedVehicle}
                  driver={activeDriver}
                  items={checklistItems}
                  onItemsChange={setChecklistItems}
                  onChange={setChecklistItems}
                  photos={photos}
                  onPhotosChange={setPhotos}
                  onProceed={handleProceedToDeclaration}
                  onBackToScanner={() => setDriverStep('scanner')}
                  onInspectionCompleted={handleInspectionFinished}
                />
              </div>
            )}

            {/* Step 4: Declaration, Odometer & Fuel Log */}
            {driverStep === 'declaration' && activeDriver && selectedVehicle && (
              <div className="space-y-6">
                <div className="max-w-4xl mx-auto">
                  <button
                    onClick={() => setDriverStep('checklist')}
                    className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1.5 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm hover:bg-slate-50 transition cursor-pointer font-semibold"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to 10-Point Checklist</span>
                  </button>
                </div>

                <DeclarationAndSubmit
                  vehicle={selectedVehicle}
                  driver={activeDriver}
                  items={checklistItems}
                  photos={photos}
                  onInspectionCompleted={handleInspectionFinished}
                />
              </div>
            )}

            {/* Step 5: Digital Inspection Pass Certificate */}
            {driverStep === 'certificate' && completedRecord && (
              <InspectionCertificate
                record={completedRecord}
                onReset={handleStartNewInspection}
              />
            )}
          </div>
        ) : (
          /* ================= ADMIN & DISPATCHER PORTAL ================= */
          <div className="space-y-6">
            {!activeAdmin ? (
              <AdminAuth onAuthenticated={handleAdminAuthenticated} />
            ) : (
              <>
                {/* Admin Sub-Tabs */}
                <div className="flex flex-wrap items-center gap-2 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-sm no-print">
                  <button
                    onClick={() => setAdminTab('fleet')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                      adminTab === 'fleet' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Truck className="w-4 h-4" />
                    <span>Vehicles Catalog</span>
                  </button>

                  <button
                    onClick={() => setAdminTab('drivers')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                      adminTab === 'drivers' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>Drivers & Accounts</span>
                  </button>

                  <button
                    onClick={() => setAdminTab('history')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                      adminTab === 'history' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <ClipboardList className="w-4 h-4" />
                    <span>Inspection Audit & Export</span>
                  </button>

                  <button
                    onClick={() => setAdminTab('bulk')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                      adminTab === 'bulk' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Send className="w-4 h-4" />
                    <span>Bulk Upload & Auto-QR</span>
                  </button>

                  <button
                    onClick={() => setAdminTab('qr')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                      adminTab === 'qr' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>QR Label Generator</span>
                  </button>

                  <button
                    onClick={() => setAdminTab('logs')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                      adminTab === 'logs' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Security Audit Logs</span>
                  </button>

                  <button
                    onClick={() => setAdminTab('backup')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                      adminTab === 'backup' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <HardDrive className="w-4 h-4" />
                    <span>Daily Backup (C:\ Drive)</span>
                  </button>
                </div>

                {/* Sub-Tab View Rendering */}
                {adminTab === 'fleet' && <FleetOverview />}
                {adminTab === 'drivers' && <DriverManagement />}
                {adminTab === 'history' && <InspectionHistory />}
                {adminTab === 'bulk' && <BulkManager />}
                {adminTab === 'qr' && <QrCodeGenerator />}
                {adminTab === 'logs' && <AuditLogViewer />}
                {adminTab === 'backup' && <BackupRetentionManager />}
              </>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 font-medium no-print">
        <p>Enterprise Pre-Trip Digital Fleet Inspection & Dispatch System • Real-Time GPS & Audit Engine</p>
      </footer>
    </div>
  );
}
