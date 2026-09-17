import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { ToastContainer } from '@/components/ToastContainer';
import { useToast } from '@/hooks/useToast';
import { wardenApi } from '@/services/api/wardenApi';
import { usePageHeader } from '@/context/PageHeaderContext';
import type { ListParams } from '@/services/api/wardenApi';

interface WardenUser {
  wardenId: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  prisonId: string;
  department: string;
  designation: string;
  permissions: string[];
  status: string;
}

export function UsersPage() {
  const [users, setUsers] = useState<WardenUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'on_leave'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statsCounts, setStatsCounts] = useState({ activeCount: 0, inactiveCount: 0, onLeaveCount: 0 });
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
      setUsers(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load users:', err);
      setLoadError('Failed to load users. Please try again.');
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
    } catch {
      // silently fail for stats
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadStats(); }, [loadStats]);

  function toggleStatus(userId: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    setUsers(prev => prev.map(u => u.wardenId === userId ? { ...u, status: newStatus } : u));
    toastSuccess(`User status updated to ${newStatus}`);
  }

  const headerIcon = useMemo(() => <span className="material-icons text-primary-600 text-xl">people</span>, []);

  usePageHeader({
    title: 'Users',
    subtitle: 'Manage warden and staff accounts',
    icon: headerIcon,
    actions: useMemo(() => (
      <button onClick={loadUsers} disabled={isLoading} className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition">
        {isLoading ? 'Refreshing...' : 'Refresh'}
      </button>
    ), [isLoading]),
  });

  if (isLoading) return <Loading message="Loading users..." />;

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
          <p className="text-xs font-semibold uppercase text-success">Active Users</p>
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

      {/* Filters */}
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
      </div>

      {/* Users Table */}
      <Card>
        <div className="overflow-auto max-h-[calc(100vh-280px)]">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">User</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Employee ID</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Department</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Designation</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Permissions</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Status</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-600">No users found</td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.wardenId} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                  <td className="py-3 px-4">
                    <p className="font-medium text-neutral-900">{user.name}</p>
                    <p className="text-xs text-neutral-500">{user.email}</p>
                  </td>
                  <td className="py-3 px-4 font-mono text-sm text-neutral-700">{user.employeeId}</td>
                  <td className="py-3 px-4 text-sm text-neutral-700">{user.department}</td>
                  <td className="py-3 px-4 text-sm text-neutral-700">{user.designation}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {user.permissions.slice(0, 3).map(p => (
                        <span key={p} className="px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-600">{p}</span>
                      ))}
                      {user.permissions.length > 3 && (
                        <span className="text-xs text-neutral-400">+{user.permissions.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                      user.status === 'active' ? 'bg-success/10 text-success border border-success/20' :
                      user.status === 'on_leave' ? 'bg-warning/10 text-warning border border-warning/20' :
                      'bg-error/10 text-error border border-error/20'
                    }`}>{user.status.replace('_', ' ')}</span>
                  </td>
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

      {/* Pagination */}
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
              onClick={() => setPage(p => Math.min(Math.ceil(total / limit), p + 1))}
              disabled={page >= Math.ceil(total / limit)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
