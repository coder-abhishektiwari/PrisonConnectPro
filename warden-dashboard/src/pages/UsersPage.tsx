import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { ToastContainer } from '@/components/ToastContainer';
import { useToast } from '@/hooks/useToast';
import { wardenApi, WardenRecord, KioskAdmin, NewWardenInput } from '@/services/api/wardenApi';
import { usePageHeader } from '@/context/PageHeaderContext';
import type { ListParams } from '@/services/api/wardenApi';

const EMPTY_FORM: NewWardenInput = { name: '', email: '', password: '', phone: '', department: '', designation: 'Warden' };

function roleBadge(user: WardenRecord) {
  return user.isChiefWarden ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-warning/15 text-warning border border-warning/30">
      <span className="material-icons text-sm">military_tech</span> Chief Warden
    </span>
  ) : (
    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-neutral-100 text-neutral-600 border border-neutral-200">Warden</span>
  );
}

function statusBadge(status: string) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
      status === 'active' ? 'bg-success/10 text-success border border-success/20' :
      status === 'on_leave' ? 'bg-warning/10 text-warning border border-warning/20' :
      'bg-error/10 text-error border border-error/20'
    }`}>{status.replace('_', ' ')}</span>
  );
}

interface FormErrors { [key: string]: string }

export function UsersPage() {
  const [users, setUsers] = useState<WardenRecord[]>([]);
  const [kioskAdmins, setKioskAdmins] = useState<KioskAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'on_leave'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statsCounts, setStatsCounts] = useState({ activeCount: 0, inactiveCount: 0, onLeaveCount: 0 });
  const [canManage, setCanManage] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewWardenInput>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const { toasts, success: toastSuccess, error: toastError, removeToast } = useToast();
  const limit = 20;

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const params: ListParams = {
        limit,
        offset: (page - 1) * limit,
        search: searchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      };
      const data = await wardenApi.getWardens(params);
      setUsers(data.items as WardenRecord[]);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load users:', err);
      setLoadError('Failed to load wardens. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [page, searchQuery, statusFilter]);

  const loadStats = useCallback(async () => {
    try {
      const data = await wardenApi.getWardenStats();
      setStatsCounts({
        activeCount: data.activeCount ?? 0,
        inactiveCount: data.inactiveCount ?? 0,
        onLeaveCount: data.onLeaveCount ?? 0,
      });
      setCanManage(!!data.canManageWardens);
    } catch {
      // silently fail for stats
    }
  }, []);

  const loadKioskAdmins = useCallback(async () => {
    try {
      setKioskAdmins(await wardenApi.getKioskAdmins());
    } catch (err) {
      console.error('Failed to load kiosk admins:', err);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadKioskAdmins(); }, [loadKioskAdmins]);

  function toggleStatus(userId: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    setUsers(prev => prev.map(u => u.wardenId === userId ? { ...u, status: newStatus } : u));
    toastSuccess(`Warden status updated to ${newStatus.replace('_', ' ')}`);
  }

  function setField(key: keyof NewWardenInput, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    setFormErrors(prev => ({ ...prev, [key]: '' }));
  }

  async function submitForm() {
    const errors: FormErrors = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!form.email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email';
    if (!form.password) errors.password = 'Password is required';
    else if (form.password.length < 6) errors.password = 'At least 6 characters';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setIsSaving(true);
      await wardenApi.createWarden(form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      toastSuccess('Warden added');
      setPage(1);
      await Promise.all([loadUsers(), loadStats()]);
    } catch (err: any) {
      const message = err?.response?.data?.error?.message || err?.message || 'Could not add warden';
      toastError(message);
    } finally {
      setIsSaving(false);
    }
  }

  const headerIcon = useMemo(() => <span className="material-icons text-primary-600 text-xl">people</span>, []);

  usePageHeader({
    title: 'Admin Management',
    subtitle: 'Wardens and kiosk admins of your prison',
    icon: headerIcon,
    actions: useMemo(() => (
      <button onClick={() => { loadUsers(); loadStats(); loadKioskAdmins(); }} disabled={isLoading} className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition">
        {isLoading ? 'Refreshing...' : 'Refresh'}
      </button>
    ), [isLoading, loadUsers, loadStats, loadKioskAdmins]),
  });

  if (isLoading && users.length === 0 && !loadError) return <Loading message="Loading wardens..." />;

  if (loadError) {
    return (
      <div className="space-y-6">
        <Card>
          <div className="text-center py-12">
            <p className="text-error mb-4">{loadError}</p>
            <button onClick={loadUsers} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">Retry</button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-neutral-200 rounded-xl">
          <p className="text-xs font-semibold uppercase text-success">Active Wardens</p>
          <p className="text-3xl font-extrabold text-neutral-900 mt-2">{statsCounts.activeCount}</p>
        </div>
        <div className="p-4 bg-white border border-neutral-200 rounded-xl">
          <p className="text-xs font-semibold uppercase text-error">Inactive</p>
          <p className="text-3xl font-extrabold text-neutral-900 mt-2">{statsCounts.inactiveCount}</p>
        </div>
        <div className="p-4 bg-white border border-neutral-200 rounded-xl">
          <p className="text-xs font-semibold uppercase text-warning">On Leave</p>
          <p className="text-3xl font-extrabold text-neutral-900 mt-2">{statsCounts.onLeaveCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Wardens */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search by name, email, or ID..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="flex-1 px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }}
              className="px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On Leave</option>
            </select>
            {canManage && (
              <button
                onClick={() => { setForm(EMPTY_FORM); setFormErrors({}); setShowForm(true); }}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold transition inline-flex items-center gap-1.5"
              >
                <span className="material-icons text-base">person_add</span> Add New Warden
              </button>
            )}
          </div>

          <Card>
            <div className="overflow-auto max-h-[calc(100vh-340px)]">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Warden</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Role</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Employee ID</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Permissions</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-neutral-600">No wardens in this prison yet</td>
                    </tr>
                  ) : users.map((user) => (
                    <tr key={user.wardenId} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-medium text-neutral-900">{user.name}</p>
                        <p className="text-xs text-neutral-500">{user.email}</p>
                      </td>
                      <td className="py-3 px-4">
                        {roleBadge(user)}
                        {user.designation && <p className="mt-1 text-xs text-neutral-500">{user.designation}</p>}
                      </td>
                      <td className="py-3 px-4 font-mono text-sm text-neutral-700">{user.employeeId || '—'}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {(user.permissions || []).slice(0, 3).map(p => (
                            <span key={p} className="px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-600">{p}</span>
                          ))}
                          {(user.permissions || []).length > 3 && (
                            <span className="text-xs text-neutral-400">+{(user.permissions || []).length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">{statusBadge(user.status)}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => toggleStatus(user.wardenId, user.status)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                            user.status === 'active'
                              ? 'bg-white border border-neutral-200 text-error hover:bg-error/5'
                              : 'bg-neutral-900 text-white hover:bg-black'
                          }`}
                        >
                          {user.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {total > 20 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-neutral-600">
                Showing {Math.min((page - 1) * limit + 1, total)}-{Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Prev
                </button>
                <span className="text-sm text-neutral-600">Page {page} of {Math.ceil(total / limit)}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= Math.ceil(total / limit)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Kiosk admins */}
        <Card>
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Kiosk Admins</h2>
              <p className="text-xs text-neutral-500">{kioskAdmins.length} in this prison</p>
            </div>
            <span className="material-icons text-primary-600">badge</span>
          </div>

          {kioskAdmins.length === 0 ? (
            <p className="px-4 py-8 text-sm text-neutral-500 text-center">No kiosk admins in this prison yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 max-h-[calc(100vh-380px)] overflow-auto">
              {kioskAdmins.map((a) => (
                <li key={a.adminId} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate">{a.name}</p>
                      <p className="text-xs text-neutral-500 truncate">{a.email}</p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded font-mono text-xs font-bold bg-primary-50 text-primary-700">
                      {a.kioskId || '—'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
                    <span className="inline-flex items-center gap-1">
                      <span className="material-icons text-sm text-neutral-400">king_bed</span>
                      {a.ward || 'Ward not set'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="material-icons text-sm text-neutral-400">groups</span>
                      {a.registeredInmates ?? 0} prisoners
                    </span>
                    {a.status && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                        a.status === 'active' ? 'bg-success/10 text-success' : 'bg-neutral-100 text-neutral-500'
                      }`}>{a.status}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Add warden modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/50 p-4 sm:p-8" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <h2 className="text-base font-bold text-neutral-900">Add New Warden</h2>
              <button onClick={() => setShowForm(false)} className="text-neutral-400 hover:text-neutral-700" title="Close">
                <span className="material-icons">close</span>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Full name</label>
                <input value={form.name} onChange={(e) => setField('name', e.target.value)} className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="e.g. Amit Verma" />
                {formErrors.name && <p className="mt-1 text-xs text-error">{formErrors.name}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="name@prison.gov.in" />
                  {formErrors.email && <p className="mt-1 text-xs text-error">{formErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Phone</label>
                  <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="+91-9000000000" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Department</label>
                  <input value={form.department} onChange={(e) => setField('department', e.target.value)} className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Security" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Designation</label>
                  <input value={form.designation} onChange={(e) => setField('designation', e.target.value)} className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Warden" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Password</label>
                <input type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="At least 6 characters" />
                {formErrors.password && <p className="mt-1 text-xs text-error">{formErrors.password}</p>}
              </div>
              <p className="text-xs text-neutral-500">The new warden joins this prison and gets the standard warden role.</p>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-200">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-200 text-neutral-700 hover:bg-neutral-50">Cancel</button>
              <button onClick={submitForm} disabled={isSaving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60">
                {isSaving ? 'Adding...' : 'Add Warden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
