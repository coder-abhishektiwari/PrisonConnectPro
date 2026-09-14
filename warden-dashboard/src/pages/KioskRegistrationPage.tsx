import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { ToastContainer } from '@/components/ToastContainer';
import { useToast } from '@/hooks/useToast';
import { wardenApi, KioskRegistrationRequestItem } from '@/services/api/wardenApi';

export function KioskRegistrationPage() {
  const [requests, setRequests] = useState<KioskRegistrationRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toasts, success, error: toastError, removeToast } = useToast();

  const fetchRequests = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await wardenApi.getKioskRegistrationRequests();
      setRequests(data);
    } catch (err) {
      console.error('Failed to fetch registration requests:', err);
      setLoadError('Failed to load registration requests');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleApprove = async (requestId: string) => {
    try {
      setActionLoading(requestId);
      await wardenApi.approveKioskRegistration(requestId);
      success('Device registration approved');
      await fetchRequests();
    } catch (err) {
      console.error('Failed to approve request:', err);
      toastError('Failed to approve request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!confirm('Are you sure you want to reject this device registration request?')) return;
    try {
      setActionLoading(requestId);
      await wardenApi.rejectKioskRegistration(requestId);
      success('Device registration rejected');
      await fetchRequests();
    } catch (err) {
      console.error('Failed to reject request:', err);
      toastError('Failed to reject request');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = requests.filter((r) => {
    const matchesFilter = filter === 'all' || r.status === filter;
    const matchesSearch =
      r.deviceSerialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.requestId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.prisonName && r.prisonName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      r.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;

  if (isLoading) return <Loading message="Loading registration requests..." />;

  if (loadError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Kiosk Registration</h1>
          <p className="text-neutral-600 mt-1">Device authorization and setup requests</p>
        </div>
        <Card>
          <div className="text-center py-12">
            <p className="text-error mb-4">{loadError}</p>
            <button onClick={() => { setIsLoading(true); fetchRequests(); }} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">Retry</button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Kiosk Registration</h1>
          <p className="text-neutral-600 mt-1">Device authorization and setup requests</p>
        </div>
        <button onClick={() => { setIsLoading(true); fetchRequests(); }} disabled={isLoading} className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition">
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <button onClick={() => setFilter('pending')} className={`p-4 rounded-xl border text-left transition ${filter === 'pending' ? 'bg-warning/10 border-warning/40' : 'bg-white border-neutral-200 hover:border-warning/30'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-warning">Pending</span>
            <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />
          </div>
          <p className="text-3xl font-extrabold text-neutral-900 mt-2">{pendingCount}</p>
          <p className="text-xs text-neutral-500 mt-1">Requires Review</p>
        </button>
        <button onClick={() => setFilter('approved')} className={`p-4 rounded-xl border text-left transition ${filter === 'approved' ? 'bg-success/10 border-success/40' : 'bg-white border-neutral-200 hover:border-success/30'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-success">Approved</span>
            <span className="w-2 h-2 bg-success rounded-full" />
          </div>
          <p className="text-3xl font-extrabold text-neutral-900 mt-2">{approvedCount}</p>
          <p className="text-xs text-neutral-500 mt-1">Active & Provisioned</p>
        </button>
        <button onClick={() => setFilter('rejected')} className={`p-4 rounded-xl border text-left transition ${filter === 'rejected' ? 'bg-error/10 border-error/40' : 'bg-white border-neutral-200 hover:border-error/30'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-error">Rejected</span>
            <span className="w-2 h-2 bg-error rounded-full" />
          </div>
          <p className="text-3xl font-extrabold text-neutral-900 mt-2">{rejectedCount}</p>
          <p className="text-xs text-neutral-500 mt-1">Access Denied</p>
        </button>
        <button onClick={() => setFilter('all')} className={`p-4 rounded-xl border text-left transition ${filter === 'all' ? 'bg-primary-50 border-primary-300' : 'bg-white border-neutral-200 hover:border-primary-200'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-primary-700">All Requests</span>
            <span className="w-2 h-2 bg-primary-500 rounded-full" />
          </div>
          <p className="text-3xl font-extrabold text-neutral-900 mt-2">{requests.length}</p>
          <p className="text-xs text-neutral-500 mt-1">Total Requests</p>
        </button>
      </div>

      {/* Filter Tabs & Search */}
      <Card>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-b border-neutral-200">
          <div className="flex gap-2">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
              <button key={tab} onClick={() => setFilter(tab)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${filter === tab ? 'bg-primary-600 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
                {tab === 'pending' ? `Pending (${pendingCount})` : tab}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Search serial, ID, location..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full sm:w-64 px-3 py-1.5 text-sm border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-600">No registration requests match the selected criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Request</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Device</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Prison / Location</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Serial</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">IP Address</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Requested</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => (
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
      </Card>
    </div>
  );
}
