import { useState, useCallback, useMemo } from 'react';
import { Card } from '@/components/Card';
import { SkeletonRows, SkeletonText } from '@/components/Skeleton';
import { ToastContainer } from '@/components/ToastContainer';
import { useToast } from '@/hooks/useToast';
import { usePageHeader } from '@/context/PageHeaderContext';
import { useCachedResource } from '@/hooks/useCachedResource';
import { wardenApi, cacheKeys, KioskRegistrationRequestItem, ListParams, PaginatedResponse } from '@/services/api/wardenApi';

const PAGE_SIZE = 20;

type KioskRegistrationStats = Awaited<ReturnType<typeof wardenApi.getKioskRegistrationStats>>;

export function KioskRegistrationPage() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const { toasts, success, error: toastError, removeToast } = useToast();

  const params = useMemo<ListParams>(() => ({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    search: searchQuery,
    status: filter !== 'all' ? filter : undefined,
  }), [page, searchQuery, filter]);

  const { data: requestData, isLoading, error, refresh } = useCachedResource<PaginatedResponse<KioskRegistrationRequestItem>>(
    cacheKeys.kioskRegistrations(params),
    () => wardenApi.getKioskRegistrationRequests(params),
    { ttl: 30_000 },
  );

  const { data: counts, refresh: refreshCounts } = useCachedResource<KioskRegistrationStats>(
    cacheKeys.kioskRegistrationStats(),
    () => wardenApi.getKioskRegistrationStats(),
    { ttl: 30_000 },
  );

  const requests = requestData?.items ?? [];
  const total = requestData?.total ?? 0;

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshCounts()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshCounts]);

  const handleApprove = async (requestId: string) => {
    try {
      setActionLoading(requestId);
      await wardenApi.approveKioskRegistration(requestId);
      success('Device registration approved');
      await Promise.all([refresh(), refreshCounts()]);
    } catch (err) {
      console.error('Failed to approve request:', err);
      toastError('Failed to approve request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setRejectTargetId(requestId);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!rejectTargetId) return;
    try {
      setActionLoading(rejectTargetId);
      await wardenApi.rejectKioskRegistration(rejectTargetId, rejectReason.trim() || undefined);
      success('Device registration rejected');
      setShowRejectModal(false);
      setRejectTargetId(null);
      setRejectReason('');
      await Promise.all([refresh(), refreshCounts()]);
    } catch (err) {
      console.error('Failed to reject request:', err);
      toastError('Failed to reject request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFilterChange = (newFilter: typeof filter) => {
    setPage(1);
    setFilter(newFilter);
  };

  const handleSearchChange = (value: string) => {
    setPage(1);
    setSearchQuery(value);
  };

  const pendingCount = counts?.pendingCount;
  const approvedCount = counts?.approvedCount;
  const rejectedCount = counts?.rejectedCount;

  const headerIcon = useMemo(() => <span className="material-icons text-primary-600 text-xl">security</span>, []);

  usePageHeader({
    title: 'Kiosk Registration Requests',
    subtitle: 'Device authorization and setup requests',
    icon: headerIcon,
    actions: useMemo(() => (
      <button onClick={refreshAll} disabled={refreshing} className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition">
        {refreshing ? 'Refreshing...' : 'Refresh'}
      </button>
    ), [refreshing, refreshAll]),
  });

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Filter Tabs & Search */}
      <Card>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-b border-neutral-200">
          <div className="flex gap-2">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
              <button key={tab} onClick={() => handleFilterChange(tab)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${filter === tab ? 'bg-primary-600 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
                {tab === 'pending' ? (
                  <>Pending ({pendingCount ?? <SkeletonText />})</>
                ) : tab}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Search serial, ID, location..." value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)} className="w-full sm:w-64 px-3 py-1.5 text-sm border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>

        {requests.length === 0 && !isLoading && !error ? (
          <div className="text-center py-12">
            <p className="text-neutral-600">No registration requests match the selected criteria.</p>
          </div>
        ) : (
        <div className="overflow-auto max-h-[calc(100vh-280px)]">
          <table className="w-full">
              <thead>
                <tr>
                  {['Request', 'Device', 'Prison / Location', 'Serial', 'IP Address', 'Requested', 'Status', 'Actions'].map((label) => (
                    <th key={label} className="sticky top-0 z-10 bg-neutral-50 border-b border-neutral-200 text-left py-3 px-4 text-sm font-semibold text-neutral-900">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && requests.length === 0 ? (
                  <SkeletonRows rows={6} cols={8} />
                ) : error && requests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <p className="text-error mb-4">{error}</p>
                      <button onClick={refresh} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">Retry</button>
                    </td>
                  </tr>
                ) : requests.map((req) => (
                  <tr key={req.requestId} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">{req.requestId}</span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-neutral-900">{req.deviceBrand} {req.deviceModel}</p>
                      <p className="text-xs text-neutral-500">v{req.appVersion} • Android {req.androidVersion}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm text-neutral-900">{req.prisonName || req.prisonId}</p>
                      <p className="text-xs text-neutral-500">{req.location}</p>
                    </td>
                    <td className="py-3 px-4 font-mono text-sm text-neutral-700">{req.deviceSerialNumber}</td>
                    <td className="py-3 px-4 font-mono text-sm text-neutral-700">{req.ipAddress}</td>
                    <td className="py-3 px-4 text-sm text-neutral-600">{new Date(req.registrationTimestamp).toLocaleString('en-IN')}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                        req.status === 'approved' ? 'bg-success/10 text-success border border-success/20' :
                        req.status === 'rejected' ? 'bg-error/10 text-error border border-error/20' :
                        'bg-warning/10 text-warning border border-warning/20'
                      }`}>{req.status}</span>
                      {req.status === 'rejected' && req.rejectionReason && (
                        <p className="text-xs text-error mt-1 max-w-[200px] truncate" title={req.rejectionReason}>{req.rejectionReason}</p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {req.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleApprove(req.requestId)} disabled={actionLoading === req.requestId} className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-bold hover:bg-black disabled:opacity-50 transition">
                            Approve
                          </button>
                          <button onClick={() => handleReject(req.requestId)} disabled={actionLoading === req.requestId} className="px-3 py-1.5 bg-white border border-neutral-200 text-neutral-700 rounded-lg text-xs font-bold hover:bg-neutral-50 disabled:opacity-50 transition">
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
            <p className="text-sm text-neutral-500">
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm font-medium border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                Prev
              </button>
              <span className="text-sm text-neutral-600">Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / PAGE_SIZE)} className="px-3 py-1.5 text-sm font-medium border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Reject Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { setShowRejectModal(false); setRejectTargetId(null); setRejectReason(''); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-2">Reject Registration</h3>
            <p className="text-sm text-neutral-600 mb-4">Optionally provide a reason so the kiosk operator knows why it was rejected.</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => { setShowRejectModal(false); setRejectTargetId(null); setRejectReason(''); }} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={confirmReject} disabled={actionLoading === rejectTargetId} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {actionLoading === rejectTargetId ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
