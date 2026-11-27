import React, { useState } from 'react';
import { Vehicle, Driver, isSupervisor, isFeederVehicle } from '../../types';
import { QrCode, Truck, ArrowRight, RefreshCw, Smartphone } from 'lucide-react';

interface QrVehicleConfirmProps {
  activeDriver: Driver;
  /** Vehicle bound by scanning its windshield QR code (null when the page was opened without one) */
  vehicle: Vehicle | null;
  /** True while the QR vehicle details are still loading */
  loading: boolean;
  /** Present only when the page was opened from a vehicle QR link: reloads that vehicle */
  onRetry?: () => void;
  onNext: (vehicle: Vehicle) => void | Promise<void>;
}

/**
 * Step 1 for drivers. A vehicle can only be chosen by scanning its QR code with the phone
 * camera (the QR link opens this page with the plate). There is no in-app scanner, search or
 * vehicle list: the driver checks the details and taps Next.
 */
export const QrVehicleConfirm: React.FC<QrVehicleConfirmProps> = ({ activeDriver, vehicle, loading, onRetry, onNext }) => {
  const [submitting, setSubmitting] = useState(false);

  const handleNext = async () => {
    if (!vehicle || submitting) return;
    setSubmitting(true);
    try {
      await onNext(vehicle);
    } finally {
      setSubmitting(false);
    }
  };

  const details: { label: string; value?: string | number }[] = vehicle
    ? [
        { label: 'Depot', value: vehicle.branch },
        { label: 'Route', value: vehicle.assignedRoute || vehicle.area },
        { label: 'Category', value: isFeederVehicle(vehicle) ? 'Feeder' : vehicle.truckCategory || 'Small Truck' },
        { label: 'Model', value: [vehicle.brand, vehicle.model].filter(Boolean).join(' ') },
      ].filter((d) => d.value)
    : [];

  return (
    <div className="w-full max-w-xl mx-auto space-y-4 px-1 sm:px-0">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm text-slate-800 space-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Step 1: Vehicle</span>
        <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
          {vehicle ? 'Confirm your vehicle' : 'Scan the QR code on your vehicle'}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 pt-0.5">
          <span>
            Driver: <strong className="text-slate-800">{activeDriver.name}</strong> ({activeDriver.employeeId} • Depot{' '}
            {activeDriver.depot})
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              isSupervisor(activeDriver.designation)
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {isSupervisor(activeDriver.designation) ? 'Supervisor (up to 3 inspections/day)' : 'Driver (1 inspection/day)'}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 shadow-sm text-center text-slate-500 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
          <div className="text-xs font-semibold">Loading the scanned vehicle...</div>
        </div>
      ) : vehicle ? (
        <div className="bg-white border-2 border-blue-500 rounded-2xl p-5 shadow-sm space-y-4" data-testid="qr-vehicle-card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <Truck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vehicle plate</div>
              <div className="font-mono font-black text-2xl text-slate-900 tracking-tight truncate">{vehicle.vehicleNo}</div>
            </div>
          </div>
          {details.length > 0 && (
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {details.map((d) => (
                <div key={d.label} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase text-slate-400">{d.label}</dt>
                  <dd className="font-semibold text-slate-800 truncate">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-[11px] text-slate-500">
            Not your vehicle? Scan the QR code on the correct vehicle with your phone camera.
          </p>
          <button
            type="button"
            onClick={handleNext}
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm shadow-blue-500/25 transition cursor-pointer"
          >
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            <span>Next</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center space-y-3" data-testid="qr-scan-instructions">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
            <QrCode className="w-7 h-7" />
          </div>
          <div className="text-sm font-bold text-slate-800">No vehicle scanned</div>
          <ol className="text-xs text-slate-600 text-left max-w-xs mx-auto space-y-1.5 list-decimal list-inside">
            <li>Open your phone camera.</li>
            <li>Point it at the QR code on the vehicle windshield.</li>
            <li>Tap the link that appears to start the inspection.</li>
          </ol>
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Vehicles can only be selected by scanning their QR code.</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mx-auto inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Could not load the vehicle. Try again</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
