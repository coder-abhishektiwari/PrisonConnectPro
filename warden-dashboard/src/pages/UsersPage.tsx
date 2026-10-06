import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { ToastContainer } from '@/components/ToastContainer';
import { useToast } from '@/hooks/useToast';
import { wardenApi, WardenRecord, KioskAdmin, NewWardenInput } from '@/services/api/wardenApi';
import { usePageHeader } from '@/context/PageHeaderContext';
import type { ListParams } from '@/services/api/wardenApi';

const EMPTY_FORM: NewWardenInput = { name: '', email: '', password: '', phone: '' };

/** One card adds and edits a warden; `mode` is all that tells them apart. */
type WardenModal = { mode: 'add' } | { mode: 'edit'; warden: WardenRecord } | null;

const EMPTY_ADMIN_FORM = { name: '', employeeId: '', email: '', password: '' };

/** Same card for kiosk admins - `employeeId` is the username used on a kiosk. */
type AdminModal = { mode: 'add' } | { mode: 'edit'; admin: KioskAdmin } | null;

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
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statsCounts, setStatsCounts] = useState({ activeCount: 0, inactiveCount: 0, onLeaveCount: 0 });
  const [canManage, setCanManage] = useState(false);
  const [wardenModal, setWardenModal] = useState<WardenModal>(null);
  const [form, setForm] = useState<NewWardenInput>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [adminModal, setAdminModal] = useState<AdminModal>(null);
  const [adminForm, setAdminForm] = useState(EMPTY_ADMIN_FORM);
  const [adminFormErrors, setAdminFormErrors] = useState<FormErrors>({});
  const [resetTarget, setResetTarget] = useState<{ kind: 'warden' | 'kiosk'; id: string; name: string; tag: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteWardenId, setPendingDeleteWardenId] = useState<string | null>(null);
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
  }, [page, searchQuery]);

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

  // Persisted status switch (the old one only flipped local state). The server
  // refuses to deactivate the chief warden or your own account.
  async function toggleWardenStatus(w: WardenRecord) {
    const next = w.status === 'active' ? 'inactive' : 'active';
    try {
      setIsSaving(true);
      await wardenApi.updateWarden(w.wardenId, { status: next });
      toastSuccess(`${w.name} ${next === 'active' ? 'activated' : 'deactivated'}`);
      await Promise.all([loadUsers(), loadStats()]);
    } catch (err: any) {
      toastError(err?.response?.data?.error?.message || err?.message || 'Could not change status');
    } finally {
      setIsSaving(false);
    }
  }

  function setField(key: keyof NewWardenInput, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    setFormErrors(prev => ({ ...prev, [key]: '' }));
  }

  function openAddWarden() {
    setPendingDeleteWardenId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setWardenModal({ mode: 'add' });
  }

  // Edit reuses the same card: email and password are add-only, so the edit
  // card carries just name and phone.
  async function submitWarden() {
    if (!wardenModal) return;
    const isEdit = wardenModal.mode === 'edit';
    const errors: FormErrors = {};
    const email = form.email.trim();
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!email) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email';
    if (!isEdit) {
      if (!form.password) errors.password = 'Password is required';
      else if (form.password.length < 6) errors.password = 'At least 6 characters';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setIsSaving(true);
      if (isEdit) {
        await wardenApi.updateWarden(wardenModal.warden.wardenId, {
          name: form.name.trim(),
          email,
          phone: (form.phone || '').trim(),
        });
      } else {
        await wardenApi.createWarden(form);
      }
      setWardenModal(null);
      setForm(EMPTY_FORM);
      toastSuccess(isEdit ? 'Warden updated' : 'Warden added');
      if (!isEdit) setPage(1);
      await Promise.all([loadUsers(), loadStats()]);
    } catch (err: any) {
      const fallback = isEdit ? 'Could not update warden' : 'Could not add warden';
      toastError(err?.response?.data?.error?.message || err?.message || fallback);
    } finally {
      setIsSaving(false);
    }
  }

  function setAdminField(key: keyof typeof EMPTY_ADMIN_FORM, value: string) {
    setAdminForm(prev => ({ ...prev, [key]: value }));
    setAdminFormErrors(prev => ({ ...prev, [key]: '' }));
  }

  function openAddAdmin() {
    setPendingDeleteId(null);
    setAdminForm(EMPTY_ADMIN_FORM);
    setAdminFormErrors({});
    setAdminModal({ mode: 'add' });
  }

  function openEditAdmin(a: KioskAdmin) {
    setPendingDeleteId(null);
    setAdminFormErrors({});
    setAdminForm({ name: a.name, employeeId: a.employeeId || '', email: a.email || '', password: '' });
    setAdminModal({ mode: 'edit', admin: a });
  }

  // One card for both: username (employeeId) and name in either mode, password
  // only when the account is created.
  async function submitAdmin() {
    if (!adminModal) return;
    const isEdit = adminModal.mode === 'edit';
    const errors: FormErrors = {};
    const name = adminForm.name.trim();
    const employeeId = adminForm.employeeId.trim();
    const email = adminForm.email.trim();
    if (!name) errors.name = 'Name is required';
    if (!employeeId) errors.employeeId = 'Username is required';
    else if (!/^[A-Za-z0-9._-]{3,40}$/.test(employeeId)) errors.employeeId = '3-40 characters: letters, digits, dot, dash or underscore';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email';
    if (!isEdit) {
      if (!adminForm.password) errors.password = 'Password is required';
      else if (adminForm.password.length < 6) errors.password = 'At least 6 characters';
    }
    setAdminFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setIsSaving(true);
      if (isEdit) {
        await wardenApi.updateKioskAdmin(adminModal.admin.adminId, { name, employeeId, email });
      } else {
        await wardenApi.createKioskAdmin({ name, employeeId, email: email || undefined, password: adminForm.password });
      }
      setAdminModal(null);
      setAdminForm(EMPTY_ADMIN_FORM);
      toastSuccess(isEdit ? 'Kiosk admin updated' : 'Kiosk admin added');
      await loadKioskAdmins();
    } catch (err: any) {
      const fallback = isEdit ? 'Could not update kiosk admin' : 'Could not add kiosk admin';
      toastError(err?.response?.data?.error?.message || err?.message || fallback);
    } finally {
      setIsSaving(false);
    }
  }

  // Active / inactive switch straight from the row - no modal for a toggle.
  async function toggleAdminStatus(a: KioskAdmin) {
    const next = (a.status || 'active') === 'active' ? 'inactive' : 'active';
    try {
      setIsSaving(true);
      await wardenApi.updateKioskAdmin(a.adminId, { status: next });
      toastSuccess(`${a.name} ${next === 'active' ? 'activated' : 'deactivated'}`);
      await loadKioskAdmins();
    } catch (err: any) {
      toastError(err?.response?.data?.error?.message || err?.message || 'Could not change status');
    } finally {
      setIsSaving(false);
    }
  }

  function openResetPassword(target: { kind: 'warden' | 'kiosk'; id: string; name: string; tag: string }) {
    setPendingDeleteId(null);
    setPendingDeleteWardenId(null);
    setNewPassword('');
    setResetTarget(target);
  }

  async function submitResetPassword() {
    if (!resetTarget) return;
    if (newPassword.length < 6) { toastError('Password must be at least 6 characters'); return; }
    try {
      setIsSaving(true);
      if (resetTarget.kind === 'warden') await wardenApi.updateWarden(resetTarget.id, { password: newPassword });
      else await wardenApi.updateKioskAdmin(resetTarget.id, { password: newPassword });
      setResetTarget(null);
      toastSuccess(`Password reset for ${resetTarget.name}`);
    } catch (err: any) {
      toastError(err?.response?.data?.error?.message || err?.message || 'Could not reset password');
    } finally {
      setIsSaving(false);
    }
  }

  function openEditWarden(w: WardenRecord) {
    setPendingDeleteWardenId(null);
    setFormErrors({});
    setForm({ name: w.name, email: w.email || '', password: '', phone: w.phone || '' });
    setWardenModal({ mode: 'edit', warden: w });
  }

  // Two-step delete for a warden: first click arms the row, second one removes.
  async function deleteWarden(w: WardenRecord) {
    if (pendingDeleteWardenId !== w.wardenId) { setPendingDeleteWardenId(w.wardenId); return; }
    setPendingDeleteWardenId(null);
    try {
      setIsSaving(true);
      await wardenApi.deleteWarden(w.wardenId);
      toastSuccess(`${w.name} deleted`);
      await Promise.all([loadUsers(), loadStats()]);
    } catch (err: any) {
      toastError(err?.response?.data?.error?.message || err?.message || 'Could not delete warden');
    } finally {
      setIsSaving(false);
    }
  }

  // Two-step delete: first click arms the row, the second one really removes it.
  async function deleteAdmin(a: KioskAdmin) {
    if (pendingDeleteId !== a.adminId) { setPendingDeleteId(a.adminId); return; }
    setPendingDeleteId(null);
    try {
      setIsSaving(true);
      await wardenApi.deleteKioskAdmin(a.adminId);
      toastSuccess(`${a.name} removed`);
      await loadKioskAdmins();
    } catch (err: any) {
      toastError(err?.response?.data?.error?.message || err?.message || 'Could not delete kiosk admin');
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
            {canManage && (
              <button
                onClick={openAddWarden}
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
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-neutral-600">No wardens in this prison yet</td>
                    </tr>
                  ) : users.map((user) => {
                    const isChief = !!user.isChiefWarden;
                    const isActive = user.status === 'active';
                    return (
                      <tr key={user.wardenId} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-medium text-neutral-900">{user.name}</p>
                          <p className="text-xs text-neutral-500">{user.email}</p>
                        </td>
                        <td className="py-3 px-4">
                          {roleBadge(user)}
                        </td>
                        {/* The chief warden has no status to show - they are always on. */}
                        <td className="py-3 px-4">
                          {isChief ? <span className="text-neutral-400">—</span> : statusBadge(user.status)}
                        </td>
                        <td className="py-3 px-4">
                          {canManage ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openResetPassword({ kind: 'warden', id: user.wardenId, name: user.name, tag: user.employeeId || user.wardenId })}
                                disabled={isSaving}
                                title="Reset password"
                                aria-label={`Reset password for ${user.name}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition disabled:opacity-50"
                              >
                                <span className="material-icons text-[18px]">lock_reset</span>
                              </button>
                              <button
                                onClick={() => openEditWarden(user)}
                                disabled={isSaving}
                                title="Edit"
                                aria-label={`Edit ${user.name}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition disabled:opacity-50"
                              >
                                <span className="material-icons text-[18px]">edit</span>
                              </button>

                              {/* No delete and no switch for the chief warden. */}
                              {!isChief && (
                                <>
                                  <button
                                    onClick={() => deleteWarden(user)}
                                    disabled={isSaving}
                                    title="Delete"
                                    aria-label={`Delete ${user.name}`}
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-50 ${
                                      pendingDeleteWardenId === user.wardenId
                                        ? 'bg-error text-white hover:bg-error/90'
                                        : 'text-neutral-500 hover:bg-error/5 hover:text-error'
                                    }`}
                                  >
                                    <span className="material-icons text-[18px]">delete_outline</span>
                                  </button>
                                  <span className={`ml-1 text-[11px] font-bold ${isActive ? 'text-success' : 'text-neutral-400'}`}>
                                    {isActive ? 'Active' : 'Inactive'}
                                  </span>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isActive}
                                    aria-label={isActive ? `Deactivate ${user.name}` : `Activate ${user.name}`}
                                    title={isActive ? 'Active - click to deactivate' : 'Inactive - click to activate'}
                                    onClick={() => toggleWardenStatus(user)}
                                    disabled={isSaving}
                                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
                                      isActive ? 'bg-success' : 'bg-neutral-300'
                                    }`}
                                  >
                                    <span
                                      className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                                        isActive ? 'translate-x-[18px]' : 'translate-x-[2px]'
                                      }`}
                                    />
                                  </button>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-400">—</span>
                          )}

                          {canManage && !isChief && pendingDeleteWardenId === user.wardenId && (
                            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-error/25 bg-error/5 px-2 py-1 text-xs">
                              <span className="font-semibold text-error">Delete {user.name}?</span>
                              <button
                                onClick={() => deleteWarden(user)}
                                disabled={isSaving}
                                className="rounded bg-error px-2 py-0.5 font-bold text-white hover:bg-error/90 disabled:opacity-60"
                              >
                                {isSaving ? 'Deleting...' : 'Yes, delete'}
                              </button>
                              <button
                                onClick={() => setPendingDeleteWardenId(null)}
                                className="px-1 font-medium text-neutral-500 hover:text-neutral-700"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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

        {/* Kiosk admins - jail-wide staff: they sign in with their user id on
            any kiosk of this prison, so nothing here is tied to one device. */}
        <Card>
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Kiosk Admins</h2>
              <p className="text-xs text-neutral-500">{kioskAdmins.length} in this prison · can sign in on any kiosk</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-icons text-primary-600">badge</span>
              <button
                onClick={openAddAdmin}
                disabled={isSaving}
                className="inline-flex items-center gap-0.5 rounded-lg border-2 border-primary-600 px-3 py-1.5 text-sm font-semibold text-primary-700 hover:bg-primary-50 transition disabled:opacity-60"
              >
                <span className="material-icons text-base">add</span> New
              </button>
            </div>
          </div>

          {kioskAdmins.length === 0 ? (
            <p className="px-4 py-8 text-sm text-neutral-500 text-center">No kiosk admins in this prison yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 max-h-[calc(100vh-380px)] overflow-auto">
              {kioskAdmins.map((a) => {
                const isActive = (a.status || 'active') === 'active';
                return (
                  <li key={a.adminId} className="px-4 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* name + ids, all on one line */}
                      <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-neutral-900 truncate">{a.name}</p>
                        <span className="rounded bg-primary-50 px-1.5 py-0.5 font-mono text-xs font-bold text-primary-700">
                          {a.employeeId || '—'}
                        </span>
                      </div>

                      {/* actions: reset password, edit, delete, status toggle */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openResetPassword({ kind: 'kiosk', id: a.adminId, name: a.name, tag: a.employeeId || a.adminId })}
                          disabled={isSaving}
                          title="Reset password"
                          aria-label={`Reset password for ${a.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition disabled:opacity-50"
                        >
                          <span className="material-icons text-[18px]">lock_reset</span>
                        </button>
                        <button
                          onClick={() => openEditAdmin(a)}
                          disabled={isSaving}
                          title="Edit"
                          aria-label={`Edit ${a.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition disabled:opacity-50"
                        >
                          <span className="material-icons text-[18px]">edit</span>
                        </button>
                        <button
                          onClick={() => deleteAdmin(a)}
                          disabled={isSaving}
                          title="Delete"
                          aria-label={`Delete ${a.name}`}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-50 ${
                            pendingDeleteId === a.adminId
                              ? 'bg-error text-white hover:bg-error/90'
                              : 'text-neutral-500 hover:bg-error/5 hover:text-error'
                          }`}
                        >
                          <span className="material-icons text-[18px]">delete_outline</span>
                        </button>

                        <span className={`ml-1 text-[11px] font-bold ${isActive ? 'text-success' : 'text-neutral-400'}`}>
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isActive}
                          aria-label={isActive ? `Deactivate ${a.name}` : `Activate ${a.name}`}
                          title={isActive ? 'Active - click to deactivate' : 'Inactive - click to activate'}
                          onClick={() => toggleAdminStatus(a)}
                          disabled={isSaving}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
                            isActive ? 'bg-success' : 'bg-neutral-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                              isActive ? 'translate-x-[18px]' : 'translate-x-[2px]'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* second step of the two-step delete */}
                    {pendingDeleteId === a.adminId && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg border border-error/25 bg-error/5 px-2.5 py-1.5 text-xs">
                        <span className="font-semibold text-error">Delete {a.name}?</span>
                        <button
                          onClick={() => deleteAdmin(a)}
                          disabled={isSaving}
                          className="rounded bg-error px-2 py-1 font-bold text-white hover:bg-error/90 disabled:opacity-60"
                        >
                          {isSaving ? 'Deleting...' : 'Yes, delete'}
                        </button>
                        <button
                          onClick={() => setPendingDeleteId(null)}
                          className="px-1 py-1 font-medium text-neutral-500 hover:text-neutral-700"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* One card for both adding and editing a warden: designation is set
          server-side on create, department and permissions are never shown. */}
      {wardenModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/50 p-4 sm:p-8" onClick={() => setWardenModal(null)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <div>
                <h2 className="text-base font-bold text-neutral-900">
                  {wardenModal.mode === 'edit' ? 'Edit Warden' : 'Add New Warden'}
                </h2>
                {wardenModal.mode === 'edit' && (
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {wardenModal.warden.isChiefWarden ? 'Chief Warden' : 'Warden'} ·{' '}
                    <span className="font-mono font-bold text-primary-700">{wardenModal.warden.employeeId || wardenModal.warden.wardenId}</span>
                  </p>
                )}
              </div>
              <button onClick={() => setWardenModal(null)} className="text-neutral-400 hover:text-neutral-700" title="Close">
                <span className="material-icons">close</span>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Full name</label>
                <input value={form.name} onChange={(e) => setField('name', e.target.value)} className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="e.g. Amit Verma" autoFocus />
                {formErrors.name && <p className="mt-1 text-xs text-error">{formErrors.name}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed"
                    placeholder="name@prison.gov.in"
                  />
                  {formErrors.email && <p className="mt-1 text-xs text-error">{formErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Phone</label>
                  <input value={form.phone || ''} onChange={(e) => setField('phone', e.target.value)} className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="+91-9000000000" />
                </div>
              </div>
              {wardenModal.mode === 'add' && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Password</label>
                  <input type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="At least 6 characters" autoComplete="new-password" />
                  {formErrors.password && <p className="mt-1 text-xs text-error">{formErrors.password}</p>}
                </div>
              )}
              <p className="text-xs text-neutral-500">
                {wardenModal.mode === 'edit'
                  ? 'Status is switched with the toggle on the row; the password with the reset icon.'
                  : 'The new warden joins this prison and gets the standard warden role.'}
              </p>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-200">
              <button onClick={() => setWardenModal(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-200 text-neutral-700 hover:bg-neutral-50">Cancel</button>
              <button onClick={submitWarden} disabled={isSaving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60">
                {isSaving
                  ? (wardenModal.mode === 'edit' ? 'Saving...' : 'Adding...')
                  : (wardenModal.mode === 'edit' ? 'Save Changes' : 'Add Warden')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* One card for both adding and editing a kiosk admin: the username
          (employeeId) is editable in either mode, the password only on create. */}
      {adminModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/50 p-4 sm:p-8" onClick={() => setAdminModal(null)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <div>
                <h2 className="text-base font-bold text-neutral-900">
                  {adminModal.mode === 'edit' ? 'Edit Kiosk Admin' : 'Add Kiosk Admin'}
                </h2>
                {adminModal.mode === 'edit' && (
                  <p className="text-xs text-neutral-500 mt-0.5">
                    User ID <span className="font-mono font-bold text-primary-700">{adminForm.employeeId || '—'}</span>
                  </p>
                )}
              </div>
              <button onClick={() => setAdminModal(null)} className="text-neutral-400 hover:text-neutral-700" title="Close">
                <span className="material-icons">close</span>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Full name</label>
                <input
                  value={adminForm.name}
                  onChange={(e) => setAdminField('name', e.target.value)}
                  className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g. Neha Gupta"
                  autoFocus
                />
                {adminFormErrors.name && <p className="mt-1 text-xs text-error">{adminFormErrors.name}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Username (employee ID)</label>
                <input
                  value={adminForm.employeeId}
                  onChange={(e) => setAdminField('employeeId', e.target.value)}
                  className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g. empsa003"
                  spellCheck={false}
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-neutral-500">What the operator types on the kiosk to sign in.</p>
                {adminFormErrors.employeeId && <p className="mt-1 text-xs text-error">{adminFormErrors.employeeId}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Email (optional)</label>
                  <input
                    type="email"
                    value={adminForm.email}
                    onChange={(e) => setAdminField('email', e.target.value)}
                    className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed"
                    placeholder="name@prisonconnect.io"
                  />
                  {adminFormErrors.email && <p className="mt-1 text-xs text-error">{adminFormErrors.email}</p>}
                </div>
                {adminModal.mode === 'add' && (
                  <div>
                    <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Password</label>
                    <input
                      type="password"
                      value={adminForm.password}
                      onChange={(e) => setAdminField('password', e.target.value)}
                      className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
                    />
                    {adminFormErrors.password && <p className="mt-1 text-xs text-error">{adminFormErrors.password}</p>}
                  </div>
                )}
              </div>
              <p className="text-xs text-neutral-500">
                {adminModal.mode === 'edit'
                  ? 'Status is switched with the toggle on the row; the password with the reset icon.'
                  : 'Signs in on any kiosk of this prison with username and password.'}
              </p>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-200">
              <button onClick={() => setAdminModal(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-200 text-neutral-700 hover:bg-neutral-50">Cancel</button>
              <button onClick={submitAdmin} disabled={isSaving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60">
                {isSaving
                  ? (adminModal.mode === 'edit' ? 'Saving...' : 'Adding...')
                  : (adminModal.mode === 'edit' ? 'Save Changes' : 'Add Kiosk Admin')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Reset kiosk admin password modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/50 p-4 sm:p-8" onClick={() => setResetTarget(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <div>
                <h2 className="text-base font-bold text-neutral-900">Reset Password</h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {resetTarget.name} · User ID <span className="font-mono font-bold text-primary-700">{resetTarget.tag || '—'}</span>
                </p>
              </div>
              <button onClick={() => setResetTarget(null)} className="text-neutral-400 hover:text-neutral-700" title="Close">
                <span className="material-icons">close</span>
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); submitResetPassword(); }}>
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">New password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-neutral-500">Used to sign in on any kiosk of this prison. The old password stops working immediately.</p>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-200">
                <button type="button" onClick={() => setResetTarget(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-200 text-neutral-700 hover:bg-neutral-50">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60">
                  {isSaving ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
