import React, { useState, useEffect, useMemo } from 'react';
import { Driver } from '../../types';
import { fetchDrivers, createDriver, updateDriver, deleteDriver } from '../../lib/api';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Phone,
  Building,
  CreditCard,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
  UserCheck,
  Lock,
  Unlock,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';

export const DriverManagement: React.FC = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedDepot, setSelectedDepot] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentDriver, setCurrentDriver] = useState<Partial<Driver>>({
    name: '',
    employeeId: '',
    loginId: '',
    password: 'password',
    designation: 'SALESMAN',
    depot: 'BL',
    depotName: 'BALAKONG',
    phone: '',
    licenseType: 'GDL Heavy / Class E',
    status: 'A',
  });

  // Window Pagination State
  const [pageSize, setPageSize] = useState<number>(15);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalPages = Math.ceil(drivers.length / pageSize) || 1;
  const paginatedDrivers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return drivers.slice(start, start + pageSize);
  }, [drivers, currentPage, pageSize]);

  // Delete confirm modal
  const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const list = await fetchDrivers({
        depot: selectedDepot,
        status: selectedStatus,
        search,
      });
      setDrivers(list);
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrivers();
  }, [selectedDepot, selectedStatus]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDrivers();
  };

  const handleOpenCreate = () => {
    setModalMode('create');
    const randomId = String(Math.floor(7000 + Math.random() * 1000));
    setCurrentDriver({
      name: '',
      employeeId: `SF${randomId}`,
      loginId: randomId,
      password: `${randomId}01`,
      designation: 'SALESMAN',
      depot: 'BL',
      depotName: 'BALAKONG',
      phone: '+60 12-',
      licenseType: 'GDL Heavy / Class E',
      status: 'A',
    });
    setMsg(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (d: Driver) => {
    setModalMode('edit');
    setCurrentDriver({ ...d });
    setMsg(null);
    setIsModalOpen(true);
  };

  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDriver.name || !currentDriver.employeeId || !currentDriver.loginId) {
      setMsg({ type: 'error', text: 'Name, Employee ID, and Login ID are required.' });
      return;
    }

    setIsProcessing(true);
    setMsg(null);
    try {
      if (modalMode === 'create') {
        const created = await createDriver(currentDriver);
        setMsg({ type: 'success', text: `Driver ${created.employeeId} (${created.name}) created successfully!` });
      } else {
        const identifier = currentDriver.employeeId || currentDriver.loginId!;
        const updated = await updateDriver(identifier, currentDriver);
        setMsg({ type: 'success', text: `Driver ${updated.employeeId} updated successfully!` });
      }
      setIsModalOpen(false);
      loadDrivers();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to save driver' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnlockDriver = async (driver: Driver) => {
    try {
      await updateDriver(driver.employeeId, {
        failedAttempts: 0,
        lockedUntil: null,
      });
      loadDrivers();
      setMsg({ type: 'success', text: `Driver ${driver.employeeId} account unlocked & security counters reset.` });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to unlock driver.' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!driverToDelete) return;
    setIsProcessing(true);
    try {
      await deleteDriver(driverToDelete.employeeId);
      setDriverToDelete(null);
      loadDrivers();
      setMsg({ type: 'success', text: `Driver ${driverToDelete.employeeId} removed successfully.` });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to delete driver.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Depots unique
  const depots = ['ALL', 'BL', 'KL', 'KJ', 'GB', 'NL', 'PG', 'IP', 'JB', 'KT', 'MK'];

  const activeCount = drivers.filter(d => d.status === 'A').length;
  const inactiveCount = drivers.filter(d => d.status === 'I').length;
  const lockedCount = drivers.filter(d => d.lockedUntil && new Date(d.lockedUntil).getTime() > Date.now()).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Action */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5 text-blue-600 font-bold text-xs uppercase tracking-wider">
              <Users className="w-4 h-4" />
              <span>Fleet Operations Directory</span>
            </div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 mt-1">Driver Roster & Account Access Control</h2>
            <p className="text-xs text-slate-500">Manage salesman & driver profiles, credentials, passwords, and depot assignments.</p>
          </div>

          <button
            onClick={handleOpenCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-2 shadow-sm shadow-blue-500/25 transition cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Driver</span>
          </button>
        </div>

        {/* Quick KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Drivers</div>
            <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">{drivers.length}</div>
          </div>
          <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-xl p-3.5">
            <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Active Staff</div>
            <div className="text-xl font-bold font-mono text-emerald-700 mt-0.5">{activeCount}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Inactive / Resigned</div>
            <div className="text-xl font-bold font-mono text-slate-500 mt-0.5">{inactiveCount}</div>
          </div>
          <div className="bg-rose-50/50 border border-rose-200/80 rounded-xl p-3.5">
            <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Locked Accounts</div>
            <div className="text-xl font-bold font-mono text-rose-700 mt-0.5">{lockedCount}</div>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`p-4 rounded-xl text-xs font-bold border flex items-center justify-between ${
          msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filters & Search Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search driver name, employee ID, designation..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 font-bold text-[11px] uppercase">Depot:</span>
            <select
              value={selectedDepot}
              onChange={(e) => setSelectedDepot(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {depots.map(d => (
                <option key={d} value={d}>{d === 'ALL' ? 'All Depots' : `Depot ${d}`}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 font-bold text-[11px] uppercase">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Status</option>
              <option value="A">Active Only</option>
              <option value="I">Inactive Only</option>
            </select>
          </div>

          <button
            onClick={loadDrivers}
            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Drivers Roster Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
            <div className="text-xs">Loading driver database...</div>
          </div>
        ) : drivers.length === 0 ? (
          <div className="py-16 px-4 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-800">Driver Directory is Empty (Zero Presets)</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              No preset drivers are loaded into the database. Go to the "Bulk Upload & QR" tab to import your driver roster spreadsheet, or click below to register a driver manually.
            </p>
            <div className="flex items-center justify-center space-x-2 pt-1">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add First Driver</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 shadow-xs">
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Driver Profile</th>
                    <th className="py-3 px-4">Employee ID</th>
                    <th className="py-3 px-4">Login ID & PIN</th>
                    <th className="py-3 px-4">Depot & Role</th>
                    <th className="py-3 px-4">License Type</th>
                    <th className="py-3 px-4">Phone Contact</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedDrivers.map((d) => {
                    const isLocked = d.lockedUntil && new Date(d.lockedUntil).getTime() > Date.now();
                    return (
                      <tr key={d.employeeId || d.loginId} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-700 text-xs flex-shrink-0 shadow-sm">
                              {d.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-xs">{d.name}</div>
                              <div className="text-[11px] text-slate-400 font-medium">Joined {d.dateCreated}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                          {d.employeeId}
                        </td>

                        <td className="py-3.5 px-4 font-mono">
                          <div className="text-blue-600 font-bold text-xs">{d.loginId}</div>
                          <div className="text-[10px] text-slate-400">Pass: {d.password || 'Default'}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {d.depot} • {d.designation}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-slate-600">
                          {d.licenseType || 'GDL Class E'}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {d.phone || '+60 12-000 0000'}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {isLocked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              <Lock className="w-3 h-3" /> Locked
                            </span>
                          ) : d.status === 'A' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                              Inactive
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {isLocked && (
                              <button
                                onClick={() => handleUnlockDriver(d)}
                                title="Unlock driver account"
                                className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg border border-amber-200 transition cursor-pointer"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEdit(d)}
                              title="Edit Driver Details"
                              className="p-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-lg transition cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDriverToDelete(d)}
                              title="Delete Driver"
                              className="p-1.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Footer Bar */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none"
                >
                  <option value={15}>15 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
                <span className="text-slate-400">|</span>
                <span>
                  Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(currentPage * pageSize, drivers.length)}</strong> of <strong>{drivers.length}</strong> drivers
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-slate-100 transition cursor-pointer"
                >
                  Previous
                </button>
                <span className="px-2.5 py-1 text-xs font-mono font-bold text-slate-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-slate-100 transition cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Driver Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {modalMode === 'create' ? 'Add New Driver Profile' : `Edit Driver: ${currentDriver.employeeId}`}
                  </h3>
                  <p className="text-xs text-slate-500">Update credentials, depot routing and contact records.</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDriver} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Full Legal Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={currentDriver.name || ''}
                    onChange={(e) => setCurrentDriver({ ...currentDriver, name: e.target.value })}
                    placeholder="e.g. MOHD KHAIRIL BIN ROSLI"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>

                {/* Employee ID */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Employee ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={currentDriver.employeeId || ''}
                    onChange={(e) => setCurrentDriver({ ...currentDriver, employeeId: e.target.value.toUpperCase() })}
                    placeholder="e.g. SF7620"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Login ID */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Driver Login ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={currentDriver.loginId || ''}
                    onChange={(e) => setCurrentDriver({ ...currentDriver, loginId: e.target.value })}
                    placeholder="e.g. 7620"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Password / PIN *
                  </label>
                  <input
                    type="text"
                    required
                    value={currentDriver.password || ''}
                    onChange={(e) => setCurrentDriver({ ...currentDriver, password: e.target.value })}
                    placeholder="e.g. 762001"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Designation */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Designation / Role
                  </label>
                  <select
                    value={currentDriver.designation || 'SALESMAN'}
                    onChange={(e) => setCurrentDriver({ ...currentDriver, designation: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="SALESMAN">SALESMAN</option>
                    <option value="DRIVER">DRIVER</option>
                    <option value="SPV">SPV / SUPERVISOR</option>
                    <option value="DELIVERY">DELIVERY CREW</option>
                  </select>
                </div>

                {/* Depot Branch */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Depot Branch
                  </label>
                  <input
                    type="text"
                    value={currentDriver.depot || 'BL'}
                    onChange={(e) => setCurrentDriver({ ...currentDriver, depot: e.target.value.toUpperCase() })}
                    placeholder="e.g. BL, KL, KJ, GB"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Contact Phone */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={currentDriver.phone || ''}
                    onChange={(e) => setCurrentDriver({ ...currentDriver, phone: e.target.value })}
                    placeholder="e.g. +60 12-345 6789"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* License Type */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    License Type
                  </label>
                  <input
                    type="text"
                    value={currentDriver.licenseType || 'GDL Heavy / Class E'}
                    onChange={(e) => setCurrentDriver({ ...currentDriver, licenseType: e.target.value })}
                    placeholder="e.g. GDL Heavy / Class E"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Active Status */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Account Status
                  </label>
                  <select
                    value={currentDriver.status || 'A'}
                    onChange={(e) => setCurrentDriver({ ...currentDriver, status: e.target.value as 'A' | 'I' })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="A">Active (Permitted to Inspect & Drive)</option>
                    <option value="I">Inactive / Suspended</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-blue-500/25 transition cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Saving...' : modalMode === 'create' ? 'Create Driver Profile' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Driver Confirmation Modal */}
      {driverToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-base text-slate-900">Delete Driver Profile?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to remove <strong>{driverToDelete.employeeId} ({driverToDelete.name})</strong> from the fleet roster?
              </p>
            </div>
            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                onClick={() => setDriverToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isProcessing}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-sm transition"
              >
                {isProcessing ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
