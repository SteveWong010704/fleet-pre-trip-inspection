import React from 'react';
import { Truck, ShieldCheck, Smartphone, LayoutDashboard, UserCheck, LogOut, Radio, Globe, ShieldAlert } from 'lucide-react';
import { Driver, AdminUser, Vehicle } from '../types';

interface NavbarProps {
  currentView: 'driver' | 'admin';
  onViewChange: (view: 'driver' | 'admin') => void;
  activeDriver: Driver | null;
  onDriverLogout: () => void;
  activeAdmin: AdminUser | null;
  onAdminLogout: () => void;
  boundVehicle?: Vehicle | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onViewChange,
  activeDriver,
  onDriverLogout,
  activeAdmin,
  onAdminLogout,
  boundVehicle,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30 text-white font-black">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-black text-lg tracking-tight text-white">FLEET SAFEGUARD</span>
                <span className="text-[10px] uppercase font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Live Sync
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                {currentView === 'driver' ? 'Driver Pre-Trip Inspection & Safety Verification' : 'Enterprise Administration & Dispatch Hub'}
              </p>
            </div>
          </div>

          {/* Center Area:
              - If Driver View AND logged in as Admin -> Show "Admin Preview Mode: Return to Admin Portal"
              - If Admin View AND logged in as Admin -> Show Admin/Driver Preview Switcher
              - If Driver View for real driver -> Show Scanned Vehicle Badge if present, no admin switcher
              - If Admin View on Login Screen -> Show "Admin Authentication" indicator
          */}
          <div className="flex items-center space-x-2">
            {currentView === 'driver' && activeAdmin ? (
              <div className="flex items-center gap-2 bg-amber-950/80 border border-amber-600/60 text-amber-300 px-3 py-1.5 rounded-xl text-xs">
                <span className="font-semibold hidden md:inline">Admin Preview Mode</span>
                <button
                  onClick={() => onViewChange('admin')}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition flex items-center gap-1 cursor-pointer"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>Return to Admin</span>
                </button>
              </div>
            ) : currentView === 'driver' && boundVehicle ? (
              <div className="hidden sm:flex items-center gap-2 bg-blue-950/80 border border-blue-700/60 px-3 py-1 rounded-xl text-xs font-mono text-blue-200">
                <Truck className="w-3.5 h-3.5 text-blue-400" />
                <span>Vehicle: <strong className="text-white">{boundVehicle.vehicleNo}</strong></span>
              </div>
            ) : currentView === 'admin' && activeAdmin ? (
              <nav className="flex items-center p-1 bg-slate-950/90 rounded-xl border border-slate-800 shadow-inner">
                <button
                  onClick={() => onViewChange('admin')}
                  className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-blue-600 text-white shadow-md shadow-blue-600/30 cursor-pointer"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>Admin Portal</span>
                </button>
                <button
                  onClick={() => onViewChange('driver')}
                  className="flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-slate-200 cursor-pointer"
                  title="Preview Driver View"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Driver Preview</span>
                </button>
              </nav>
            ) : null}
          </div>

          {/* Right Header Status / Active Profile */}
          <div className="flex items-center space-x-3">
            {currentView === 'driver' && activeDriver ? (
              <div className="flex items-center space-x-2.5 bg-slate-800/90 border border-slate-700/90 px-3 py-1.5 rounded-xl shadow-sm">
                <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-400/50 text-blue-300 flex items-center justify-center font-bold text-xs">
                  {activeDriver.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="text-left hidden md:block">
                  <div className="text-xs font-bold text-slate-200 truncate max-w-[140px]">
                    {activeDriver.name.split(' ')[0]} ({activeDriver.depot})
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">ID: {activeDriver.loginId}</div>
                </div>
                <button
                  onClick={onDriverLogout}
                  title="Switch Driver / Logout"
                  className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : currentView === 'admin' && activeAdmin ? (
              <div className="flex items-center space-x-2.5 bg-slate-800/90 border border-slate-700/90 px-3 py-1.5 rounded-xl shadow-sm">
                <div className="w-7 h-7 rounded-full bg-emerald-600/30 border border-emerald-400/50 text-emerald-300 flex items-center justify-center font-bold text-xs">
                  AD
                </div>
                <div className="text-left hidden md:block">
                  <div className="text-xs font-bold text-slate-200 truncate max-w-[140px]">
                    {activeAdmin.name} ({activeAdmin.role})
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">{activeAdmin.username}</div>
                </div>
                <button
                  onClick={onAdminLogout}
                  title="Admin Logout"
                  className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : currentView === 'admin' && !activeAdmin ? (
              <div className="flex items-center space-x-1.5 text-xs text-blue-300 bg-blue-950/60 px-3 py-1.5 rounded-xl border border-blue-800/80 font-medium">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span className="font-semibold">Admin Login</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/80 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Fleet Audit Platform</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
