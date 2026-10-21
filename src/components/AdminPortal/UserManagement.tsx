import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Shield,
  ShieldCheck,
  Plus,
  Edit2,
  Trash2,
  Search,
  Building2,
  KeyRound,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  Lock,
  Check,
  Briefcase,
  Layers,
  Sparkles,
} from 'lucide-react';
import { RbacUser, RbacRole, RbacFeature, ADMIN_FEATURES, DepotItem } from '../../types';
import {
  fetchRbacUsers,
  fetchRbacRoles,
  fetchRbacFeatures,
  createRbacUserApi,
  updateRbacUserApi,
  deleteRbacUserApi,
  createRbacRoleApi,
  updateRbacRoleApi,
  deleteRbacRoleApi,
  fetchDepots,
} from '../../lib/api';

export const UserManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'matrix'>('users');
  const [users, setUsers] = useState<RbacUser[]>([]);
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [features, setFeatures] = useState<RbacFeature[]>(ADMIN_FEATURES);
  const [depots, setDepots] = useState<DepotItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingMatrix, setSavingMatrix] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Filters for User list
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [depotFilter, setDepotFilter] = useState<string>('ALL');

  // Matrix edit state: Map of roleId -> Set of featureIds
  const [matrixState, setMatrixState] = useState<Record<string, string[]>>({});
  const [matrixDirty, setMatrixDirty] = useState<boolean>(false);

  // User Modal State
  const [showUserModal, setShowUserModal] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<RbacUser | null>(null);
  const [userFormData, setUserFormData] = useState({
    username: '',
    name: '',
    password: '',
    role: 'Logistic Admin',
    assignedDepot: 'ALL',
    active: true,
  });
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [userModalSubmitting, setUserModalSubmitting] = useState<boolean>(false);

  // Role Modal State
  const [showRoleModal, setShowRoleModal] = useState<boolean>(false);
  const [editingRole, setEditingRole] = useState<RbacRole | null>(null);
  const [roleFormData, setRoleFormData] = useState({
    name: '',
    description: '',
    permissions: [] as string[],
  });
  const [roleModalSubmitting, setRoleModalSubmitting] = useState<boolean>(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [uList, rList, fList, dList] = await Promise.all([
        fetchRbacUsers().catch(() => []),
        fetchRbacRoles().catch(() => []),
        fetchRbacFeatures().catch(() => ADMIN_FEATURES),
        fetchDepots().catch(() => []),
      ]);

      setUsers(uList);
      setRoles(rList);
      setFeatures(fList.length > 0 ? fList : ADMIN_FEATURES);
      setDepots(dList);

      // Initialize matrix state
      const initialMatrix: Record<string, string[]> = {};
      rList.forEach((r) => {
        initialMatrix[r.id] = [...(r.permissions || [])];
      });
      setMatrixState(initialMatrix);
      setMatrixDirty(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load user and role directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showNotification = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(null), 4000);
  };

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (depotFilter !== 'ALL' && u.assignedDepot !== depotFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          u.username.toLowerCase().includes(q) ||
          u.name.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q) ||
          u.assignedDepot.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, roleFilter, depotFilter, searchQuery]);

  // Handle open Add User Modal
  const handleOpenAddUser = () => {
    setEditingUser(null);
    setUserFormData({
      username: '',
      name: '',
      password: '',
      role: roles.length > 0 ? roles[0].name : 'Logistic Admin',
      assignedDepot: 'ALL',
      active: true,
    });
    setShowPassword(false);
    setShowUserModal(true);
  };

  // Handle open Edit User Modal
  const handleOpenEditUser = (user: RbacUser) => {
    setEditingUser(user);
    setUserFormData({
      username: user.username,
      name: user.name,
      password: '',
      role: user.role,
      assignedDepot: user.assignedDepot || 'ALL',
      active: user.active,
    });
    setShowPassword(false);
    setShowUserModal(true);
  };

  // Save User (Create or Update)
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.name.trim()) {
      alert('Full Name is required');
      return;
    }

    if (!editingUser) {
      if (!userFormData.username.trim()) {
        alert('Username is required');
        return;
      }
      if (!userFormData.password || userFormData.password.length < 4) {
        alert('Password must be at least 4 characters long');
        return;
      }
    }

    try {
      setUserModalSubmitting(true);
      if (editingUser) {
        await updateRbacUserApi(editingUser.username, {
          name: userFormData.name.trim(),
          password: userFormData.password.trim() || undefined,
          role: userFormData.role,
          assignedDepot: userFormData.assignedDepot,
          active: userFormData.active,
        });
        showNotification(`User account @${editingUser.username} updated successfully!`);
      } else {
        await createRbacUserApi({
          username: userFormData.username.trim(),
          name: userFormData.name.trim(),
          password: userFormData.password.trim(),
          role: userFormData.role,
          assignedDepot: userFormData.assignedDepot,
        });
        showNotification(`New user @${userFormData.username.trim()} provisioned successfully!`);
      }
      setShowUserModal(false);
      await loadData();
    } catch (err: any) {
      alert(`User operation failed: ${err.message}`);
    } finally {
      setUserModalSubmitting(false);
    }
  };

  // Toggle user active status
  const handleToggleUserActive = async (user: RbacUser) => {
    if (user.username === 'steve') {
      alert('Primary Global Admin "steve" cannot be deactivated.');
      return;
    }
    try {
      const updatedActive = !user.active;
      await updateRbacUserApi(user.username, { active: updatedActive });
      showNotification(`User @${user.username} is now ${updatedActive ? 'Active' : 'Disabled'}.`);
      await loadData();
    } catch (err: any) {
      alert(`Failed to update user: ${err.message}`);
    }
  };

  // Delete user
  const handleDeleteUser = async (user: RbacUser) => {
    if (user.username === 'steve') {
      alert('Primary Global Admin "steve" cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete user @${user.username} (${user.name})?`)) {
      return;
    }
    try {
      await deleteRbacUserApi(user.username);
      showNotification(`User @${user.username} removed.`);
      await loadData();
    } catch (err: any) {
      alert(`Failed to delete user: ${err.message}`);
    }
  };

  // Generate strong random password
  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setUserFormData((prev) => ({ ...prev, password: pass }));
    setShowPassword(true);
  };

  // ===================== PERMISSION MATRIX HANDLERS =====================

  const handleTogglePermission = (roleId: string, featureId: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (role?.isSystem || role?.name === 'Global Admin') {
      // Global Admin permissions are locked to all
      return;
    }

    setMatrixState((prev) => {
      const current = prev[roleId] || [];
      const exists = current.includes(featureId);
      const updated = exists ? current.filter((f) => f !== featureId) : [...current, featureId];
      return { ...prev, [roleId]: updated };
    });
    setMatrixDirty(true);
  };

  const handleSelectAllForRole = (roleId: string, selectAll: boolean) => {
    const role = roles.find((r) => r.id === roleId);
    if (role?.isSystem || role?.name === 'Global Admin') return;

    setMatrixState((prev) => ({
      ...prev,
      [roleId]: selectAll ? features.map((f) => f.id) : [],
    }));
    setMatrixDirty(true);
  };

  const handleSavePermissionMatrix = async () => {
    try {
      setSavingMatrix(true);
      const updates = roles.map((r) => {
        const perms = matrixState[r.id] || [];
        return updateRbacRoleApi(r.id, { permissions: perms });
      });
      await Promise.all(updates);
      setMatrixDirty(false);
      showNotification('Permission matrix updated! All user sessions will reflect these permissions on next login.');
      await loadData();
    } catch (err: any) {
      alert(`Failed to save permission matrix: ${err.message}`);
    } finally {
      setSavingMatrix(false);
    }
  };

  // Add / Edit Custom Role
  const handleOpenAddRole = () => {
    setEditingRole(null);
    setRoleFormData({
      name: '',
      description: '',
      permissions: ['fleet', 'history'],
    });
    setShowRoleModal(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleFormData.name.trim()) {
      alert('Position / Role name is required');
      return;
    }

    try {
      setRoleModalSubmitting(true);
      if (editingRole) {
        await updateRbacRoleApi(editingRole.id, {
          name: roleFormData.name.trim(),
          description: roleFormData.description.trim(),
        });
        showNotification(`Position "${roleFormData.name}" updated!`);
      } else {
        await createRbacRoleApi({
          name: roleFormData.name.trim(),
          description: roleFormData.description.trim(),
          permissions: roleFormData.permissions,
        });
        showNotification(`New position "${roleFormData.name}" added to matrix!`);
      }
      setShowRoleModal(false);
      await loadData();
    } catch (err: any) {
      alert(`Role operation failed: ${err.message}`);
    } finally {
      setRoleModalSubmitting(false);
    }
  };

  const handleDeleteRole = async (role: RbacRole) => {
    if (role.isSystem || role.name === 'Global Admin') {
      alert('Global Admin is a core system role and cannot be removed.');
      return;
    }
    const assignedCount = users.filter((u) => u.role === role.name).length;
    if (assignedCount > 0) {
      alert(`Cannot delete position "${role.name}" because ${assignedCount} user(s) are currently assigned to it.`);
      return;
    }
    if (!window.confirm(`Permanently remove custom position "${role.name}" from the system?`)) {
      return;
    }
    try {
      await deleteRbacRoleApi(role.id);
      showNotification(`Position "${role.name}" deleted.`);
      await loadData();
    } catch (err: any) {
      alert(`Failed to delete position: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <span>User Management & Role-Based Access Control (RBAC)</span>
            </h1>
            <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              Granular Security Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Provision staff accounts, bind users to specific depots or all branches, configure dynamic positions, and enforce fine-grained tab visibility.
          </p>
        </div>

        {/* Global Admin Quick Note & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {activeTab === 'users' ? (
            <button
              onClick={handleOpenAddUser}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Staff User</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenAddRole}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                <span>Add Position</span>
              </button>
              <button
                onClick={handleSavePermissionMatrix}
                disabled={savingMatrix || !matrixDirty}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingMatrix ? 'Saving Matrix...' : 'Save Permission Matrix'}</span>
              </button>
            </div>
          )}

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl transition cursor-pointer"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global Admin Security Pill */}
      <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            <strong>Primary Global Administrator:</strong> <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono font-bold">username: steve</code> &bull; Has 100% unrestricted access to all modules, branches, and security policies.
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-mono text-blue-700 font-medium">
          <span>{users.length} Users</span>
          <span>&bull;</span>
          <span>{roles.length} Positions</span>
        </div>
      </div>

      {successNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 font-bold">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Top View Switcher (Users Directory vs Permission Matrix) */}
      <div className="flex items-center gap-2 p-1 bg-white border border-slate-200 rounded-2xl shadow-sm w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'users'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Staff Users Directory ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('matrix')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer relative ${
            activeTab === 'matrix'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Roles & Permission Matrix ({roles.length} Positions)</span>
          {matrixDirty && (
            <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-1.5 right-1.5 ring-2 ring-white"></span>
          )}
        </button>
      </div>

      {/* ================= TAB 1: USERS DIRECTORY ================= */}
      {activeTab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search user, name, role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 w-52 sm:w-60"
                />
              </div>

              {/* Role Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium">Position:</span>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Positions</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Depot Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium">Depot:</span>
                <select
                  value={depotFilter}
                  onChange={(e) => setDepotFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Depots</option>
                  {depots.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} {d.name ? `- ${d.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-500 font-mono">
              Showing {filteredUsers.length} of {users.length} accounts
            </div>
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto overflow-y-auto max-h-[480px] rounded-xl border border-slate-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/95 backdrop-blur border-b border-slate-200 text-slate-700 font-semibold uppercase text-[10px] tracking-wider font-mono sticky top-0 z-10 shadow-xs">
                <tr>
                  <th className="py-3 px-3">User</th>
                  <th className="py-3 px-3">Position / Role</th>
                  <th className="py-3 px-3">Assigned Depot</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3">Created</th>
                  <th className="py-3 px-3">Last Login</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => {
                  const isSteve = user.username === 'steve';
                  const initials = user.name
                    ? user.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)
                    : user.username.slice(0, 2).toUpperCase();

                  const roleBadgeColor =
                    user.role === 'Global Admin'
                      ? 'bg-purple-50 text-purple-800 border-purple-200'
                      : user.role === 'Logistic Admin'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : user.role === 'Sales Operation'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : user.role === 'Logistics Manager'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : user.role === 'Feeder Admin'
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      : 'bg-slate-100 text-slate-800 border-slate-200';

                  return (
                    <tr key={user.username} className="hover:bg-slate-50/80 transition-colors">
                      {/* User Info */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              isSteve ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-700 font-mono'
                            }`}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{user.name}</span>
                              {isSteve && (
                                <span className="bg-purple-100 text-purple-700 text-[9px] font-bold px-1.5 py-0.2 rounded font-mono">
                                  Primary Admin
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">@{user.username}</div>
                          </div>
                        </div>
                      </td>

                      {/* Position / Role */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block font-mono font-bold text-[11px] px-2.5 py-0.5 rounded-lg border ${roleBadgeColor}`}
                        >
                          {user.role}
                        </span>
                      </td>

                      {/* Assigned Depot */}
                      <td className="py-3 px-3">
                        <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 inline-flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          <span>{user.assignedDepot || 'ALL'}</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleToggleUserActive(user)}
                          disabled={isSteve}
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full transition cursor-pointer ${
                            user.active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                          } disabled:cursor-default`}
                          title={isSteve ? 'Global Admin is always active' : 'Click to toggle Active status'}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${user.active ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          />
                          <span>{user.active ? 'Active' : 'Disabled'}</span>
                        </button>
                      </td>

                      {/* Created Date */}
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                        {user.createdAt ? user.createdAt.slice(0, 10) : '-'}
                      </td>

                      {/* Last Login */}
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                        {user.lastLogin ? user.lastLogin.replace('T', ' ').slice(0, 16) : 'Never'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditUser(user)}
                            className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition cursor-pointer"
                            title="Edit User Details / Reset Password"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {!isSteve && (
                            <button
                              onClick={() => handleDeleteUser(user)}
                              className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-600 hover:text-rose-800 transition cursor-pointer"
                              title="Delete User"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Users className="w-8 h-8 text-slate-300" />
                        <p className="font-semibold text-slate-600 text-sm">No users found</p>
                        <p className="text-xs text-slate-400">Try adjusting your search query or role filter.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= TAB 2: ROLES & PERMISSION MATRIX ================= */}
      {activeTab === 'matrix' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Dynamic Permission Matrix</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Grant or restrict access to specific administrative features per position. Changes take effect on next login.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenAddRole}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Position</span>
              </button>

              <button
                onClick={handleSavePermissionMatrix}
                disabled={savingMatrix || !matrixDirty}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingMatrix ? 'Saving...' : 'Save Matrix'}</span>
              </button>
            </div>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto overflow-y-auto max-h-[520px] rounded-xl border border-slate-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/95 backdrop-blur border-b border-slate-200 text-slate-700 font-semibold uppercase text-[10px] tracking-wider font-mono sticky top-0 z-20 shadow-xs">
                <tr>
                  <th className="py-3 px-3 w-72 min-w-[280px]">Feature / Module</th>
                  {roles.map((role) => (
                    <th key={role.id} className="py-3 px-3 text-center min-w-[140px]">
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-slate-900 text-xs font-sans normal-case">{role.name}</span>
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            type="button"
                            onClick={() => handleSelectAllForRole(role.id, true)}
                            disabled={role.isSystem || role.name === 'Global Admin'}
                            className="text-[9px] text-blue-600 hover:text-blue-800 font-mono disabled:opacity-30 cursor-pointer"
                          >
                            All
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleSelectAllForRole(role.id, false)}
                            disabled={role.isSystem || role.name === 'Global Admin'}
                            className="text-[9px] text-slate-500 hover:text-slate-700 font-mono disabled:opacity-30 cursor-pointer"
                          >
                            None
                          </button>
                          {!role.isSystem && role.name !== 'Global Admin' && (
                            <>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteRole(role)}
                                className="text-[9px] text-rose-500 hover:text-rose-700 font-mono cursor-pointer"
                                title="Delete this role"
                              >
                                &times;
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {features.map((feat) => {
                  return (
                    <tr key={feat.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Feature Info */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{feat.label}</div>
                        <div className="text-[10px] text-slate-500 line-clamp-1">{feat.description}</div>
                        <span className="text-[9px] uppercase font-mono text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded mt-0.5 inline-block">
                          {feat.category} &bull; tab: {feat.id}
                        </span>
                      </td>

                      {/* Checkbox per Role */}
                      {roles.map((role) => {
                        const isGlobalAdmin = role.isSystem || role.name === 'Global Admin';
                        const currentPerms = matrixState[role.id] || role.permissions || [];
                        const isChecked = isGlobalAdmin || currentPerms.includes(feat.id);

                        return (
                          <td key={`${role.id}-${feat.id}`} className="py-3 px-3 text-center">
                            <label className="inline-flex items-center justify-center cursor-pointer p-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={isGlobalAdmin}
                                onChange={() => handleTogglePermission(role.id, feat.id)}
                                className={`w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer ${
                                  isGlobalAdmin ? 'opacity-80 accent-blue-600' : ''
                                }`}
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 gap-2">
            <span>
              Ticking a feature immediately includes it in the user's management navigation bar when they log in.
            </span>
            {matrixDirty && (
              <span className="text-amber-700 font-bold flex items-center gap-1">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Unsaved changes in matrix
              </span>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT USER ================= */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-slate-900">
                  {editingUser ? `Edit User: @${editingUser.username}` : 'Provision New Staff User'}
                </h3>
              </div>
              <button
                onClick={() => setShowUserModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              {/* Username (Locked if editing) */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Username</label>
                <input
                  type="text"
                  value={userFormData.username}
                  disabled={!!editingUser}
                  onChange={(e) =>
                    setUserFormData((prev) => ({
                      ...prev,
                      username: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                    }))
                  }
                  placeholder="e.g. john_doe, logistic_lead"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
                <span className="text-[10px] text-slate-400">Lowercase letters, numbers, and dashes.</span>
              </div>

              {/* Full Name */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Full Name</label>
                <input
                  type="text"
                  value={userFormData.name}
                  onChange={(e) => setUserFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Johnathan Tan"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Password */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-700">
                    Password {editingUser && <span className="font-normal text-slate-400">(leave blank to keep current)</span>}
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Generate Strong</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={userFormData.password}
                    onChange={(e) => setUserFormData((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder={editingUser ? '••••••••' : 'Enter user login password'}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-3 pr-10 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Position / Role & Assigned Depot (2 columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Role */}
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Position / Role</label>
                  <select
                    value={userFormData.role}
                    disabled={editingUser?.username === 'steve'}
                    onChange={(e) => setUserFormData((prev) => ({ ...prev, role: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-60"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Assigned Depot */}
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Assigned Depot</label>
                  <select
                    value={userFormData.assignedDepot}
                    onChange={(e) => setUserFormData((prev) => ({ ...prev, assignedDepot: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="ALL">ALL Depots (Full Network)</option>
                    {depots.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} {d.name ? `- ${d.name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status checkbox */}
              {editingUser && editingUser.username !== 'steve' && (
                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userFormData.active}
                      onChange={(e) => setUserFormData((prev) => ({ ...prev, active: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="font-semibold text-slate-700">Account Active (Permit Login)</span>
                  </label>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={userModalSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-50"
                >
                  {userModalSubmitting ? 'Saving...' : editingUser ? 'Update Account' : 'Provision User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT POSITION (ROLE) ================= */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Briefcase className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-slate-900">
                  {editingRole ? `Edit Position: ${editingRole.name}` : 'Add New Position / Role'}
                </h3>
              </div>
              <button
                onClick={() => setShowRoleModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Position / Role Title</label>
                <input
                  type="text"
                  value={roleFormData.name}
                  onChange={(e) => setRoleFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Feeder Admin, Sales Operation, Workshop Lead"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Description / Responsibilities</label>
                <textarea
                  rows={2}
                  value={roleFormData.description}
                  onChange={(e) => setRoleFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Summary of operational duties and role scope..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={roleModalSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-50"
                >
                  {roleModalSubmitting ? 'Saving...' : 'Add Position'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
