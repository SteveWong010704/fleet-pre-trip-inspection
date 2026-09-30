import React, { useState, useEffect } from 'react';
import { Driver, Vehicle, InspectionRecord } from '../../types';
import { loginDriver, checkDriverDailyInspection, checkVehicleDailyInspection } from '../../lib/api';
import { UserCheck, ShieldAlert, KeyRound, User, ArrowRight, RefreshCw, AlertCircle, Truck, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface DriverAuthProps {
  onAuthenticated: (driver: Driver) => void;
  activeDriver: Driver | null;
  boundVehicle?: Vehicle | null;
  onViewCertificate?: (record: InspectionRecord) => void;
}

export const DriverAuth: React.FC<DriverAuthProps> = ({ onAuthenticated, activeDriver, boundVehicle, onViewCertificate }) => {
  const [loginId, setLoginId] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [alreadyInspectedRecord, setAlreadyInspectedRecord] = useState<InspectionRecord | null>(null);
  const [vehicleInspectedRecord, setVehicleInspectedRecord] = useState<InspectionRecord | null>(null);
  const [checkingVehicle, setCheckingVehicle] = useState<boolean>(false);
  const [driverCount, setDriverCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/drivers')
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.drivers)) {
          setDriverCount(data.drivers.length);
        }
      })
      .catch(() => {});
  }, []);

  // When a vehicle is bound (e.g. from QR scan), check whether this truck has already been inspected today
  useEffect(() => {
    if (boundVehicle?.vehicleNo) {
      setCheckingVehicle(true);
      checkVehicleDailyInspection(boundVehicle.vehicleNo)
        .then((res) => {
          if (res.hasInspectedToday && res.inspection) {
            setVehicleInspectedRecord(res.inspection);
          } else {
            setVehicleInspectedRecord(null);
          }
        })
        .catch(() => {})
        .finally(() => setCheckingVehicle(false));
    } else {
      setVehicleInspectedRecord(null);
    }
  }, [boundVehicle?.vehicleNo]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setAlreadyInspectedRecord(null);

    // If bound truck has already been inspected today by ANY driver, prevent login and inspection
    if (vehicleInspectedRecord) {
      setErrorMsg(`Inspection Blocked: Truck ${boundVehicle?.vehicleNo} has already completed daily inspection today (${vehicleInspectedRecord.id}) by driver ${vehicleInspectedRecord.driverName}. Another driver cannot inspect this truck again today.`);
      return;
    }

    if (!loginId.trim() || !password.trim()) {
      setErrorMsg('Please enter both your Driver ID and Password.');
      return;
    }

    setIsAuthenticating(true);
    try {
      // Re-verify truck daily inspection in real-time if boundVehicle exists
      if (boundVehicle?.vehicleNo) {
        const vCheck = await checkVehicleDailyInspection(boundVehicle.vehicleNo);
        if (vCheck.hasInspectedToday && vCheck.inspection) {
          setVehicleInspectedRecord(vCheck.inspection);
          setErrorMsg(`Inspection Blocked: Truck ${boundVehicle.vehicleNo} has already completed daily inspection today (${vCheck.inspection.id}) by driver ${vCheck.inspection.driverName}. Each truck can only be inspected once per day.`);
          setIsAuthenticating(false);
          return;
        }
      }

      const res = await loginDriver(loginId.trim(), password.trim());
      if (res.success && res.driver) {
        // Check if driver has already completed daily inspection
        const dailyCheck = await checkDriverDailyInspection(res.driver.loginId);
        if (dailyCheck.hasInspectedToday && dailyCheck.inspection) {
          setAlreadyInspectedRecord(dailyCheck.inspection);
          setErrorMsg(`Daily Inspection Limit Reached: Driver ${res.driver.name} has already completed an inspection today (${dailyCheck.inspection.id}) for vehicle ${dailyCheck.inspection.vehicleNo}. Each driver is restricted to 1 inspection per day.`);
          setIsAuthenticating(false);
          return;
        }
        onAuthenticated(res.driver);
      } else {
        setErrorMsg(res.message || 'Authentication failed. Please verify your Driver ID and Password.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Server connection failed. Please check your network.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-6 space-y-6">
      {/* Zero-Preset Database Notification */}
      {driverCount === 0 && (
        <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-4 text-amber-950 shadow-xs space-y-2.5">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="font-bold text-amber-900">Driver Roster Empty (Zero Presets Active)</div>
              <p className="text-amber-800 leading-relaxed">
                No preset driver credentials are pre-loaded. Please contact dispatch or administrator to register your driver account.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle QR Bound Banner (if opened via QR code) */}
      {boundVehicle && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-blue-900 shadow-sm flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <Truck className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
              Vehicle QR Code Scanned
            </div>
            <div className="font-mono font-black text-base text-slate-900">
              {boundVehicle.vehicleNo}
            </div>
            <div className="text-[11px] text-slate-600">
              {boundVehicle.brand} {boundVehicle.model} • Depot {boundVehicle.branch}
            </div>
          </div>
          {checkingVehicle && (
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          )}
        </div>
      )}

      {/* Vehicle Already Inspected Warning Banner */}
      {vehicleInspectedRecord && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 text-rose-950 shadow-sm space-y-3">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                Inspection Blocked • Truck Already Inspected Today
              </div>
              <div className="font-bold text-sm text-rose-950">
                Truck {boundVehicle?.vehicleNo} has already completed daily inspection
              </div>
              <p className="text-xs text-rose-800 leading-relaxed">
                This vehicle was already inspected today by driver <strong>{vehicleInspectedRecord.driverName}</strong> ({vehicleInspectedRecord.driverId}).
              </p>
              <div className="text-[11px] font-mono text-rose-700 pt-0.5">
                Pass ID: <strong>{vehicleInspectedRecord.id}</strong> • Result: <span className="font-bold">{vehicleInspectedRecord.overallResult}</span>
              </div>
            </div>
          </div>

          {onViewCertificate && (
            <button
              type="button"
              onClick={() => onViewCertificate(vehicleInspectedRecord)}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center space-x-2 transition cursor-pointer shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>View Today's Vehicle Inspection Certificate</span>
            </button>
          )}
        </div>
      )}

      {/* Driver Already Inspected Warning Banner */}
      {alreadyInspectedRecord && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-amber-950 text-xs space-y-2.5">
          <div className="flex items-start space-x-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-amber-950 text-xs">
                Daily Inspection Limit Reached: 1 Inspection Per Day
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                You have already submitted a daily inspection today for truck <strong>{alreadyInspectedRecord.vehicleNo}</strong> (Cert: <code>{alreadyInspectedRecord.id}</code>). Each driver is restricted to one vehicle inspection per day.
              </p>
            </div>
          </div>

          {onViewCertificate && (
            <button
              type="button"
              onClick={() => onViewCertificate(alreadyInspectedRecord)}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center space-x-2 transition cursor-pointer shadow-xs"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>View Your Inspection Certificate</span>
            </button>
          )}
        </div>
      )}

      {/* Driver Login Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl text-slate-800 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto shadow-sm">
            <UserCheck className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Driver Sign-In</h2>
          <p className="text-xs text-slate-500">
            {vehicleInspectedRecord
              ? 'This truck has already completed its daily pre-trip check today.'
              : boundVehicle
              ? 'Sign in with your Driver ID to proceed directly to the 10-point inspection.'
              : 'Sign in with your Driver ID to perform your daily pre-trip inspection.'}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          {errorMsg && (
            <div className="flex items-start space-x-2.5 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Driver / Employee ID
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="Enter Driver ID"
                autoComplete="username"
                disabled={!!vehicleInspectedRecord}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono shadow-sm disabled:opacity-50 disabled:bg-slate-100"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Password / PIN
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Password / PIN"
                autoComplete="current-password"
                disabled={!!vehicleInspectedRecord}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm disabled:opacity-50 disabled:bg-slate-100"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isAuthenticating || !!vehicleInspectedRecord}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-md shadow-blue-500/25 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAuthenticating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Verifying Driver...</span>
              </>
            ) : vehicleInspectedRecord ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>Truck Already Inspected Today</span>
              </>
            ) : (
              <>
                <span>Sign In & Continue Inspection</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center text-[11px] text-slate-400 border-t border-slate-100 pt-3">
          <span>Commercial Vehicle Pre-Trip Safety Standard • 1 Inspection Per Truck/Driver Per Day</span>
        </div>
      </div>
    </div>
  );
};
