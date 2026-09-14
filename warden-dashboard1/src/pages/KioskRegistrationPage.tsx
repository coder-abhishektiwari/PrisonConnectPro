import React, { useEffect, useState } from 'react';
import { wardenApi, KioskRegistrationRequestItem } from '@/services/api/wardenApi';
import { ToastContainer } from '@/components/ToastContainer';
import { useToast } from '@/hooks/useToast';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ServerIcon,
  FunnelIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  DevicePhoneMobileIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';

export const KioskRegistrationPage: React.FC = () => {
  const [requests, setRequests] = useState<KioskRegistrationRequestItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toasts, success, error: toastError, removeToast } = useToast();

  const fetchRequests = async () => {
    setLoadError(null);
    try {
      setLoading(true);
      const data = await wardenApi.getKioskRegistrationRequests();
      setRequests(data);
    } catch (err) {
      console.error('Failed to fetch registration requests:', err);
      setLoadError('Failed to load registration requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

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

  const filteredRequests = requests.filter((r) => {
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheckIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            Kiosk Device Authorization & Registrations
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Review first-time kiosk device setup requests and manage authorization status.
          </p>
        </div>

        <button
          onClick={fetchRequests}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Requests
        </button>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          onClick={() => setFilter('pending')}
          className={`cursor-pointer p-4 rounded-xl border transition ${
            filter === 'pending'
              ? 'bg-amber-500/10 border-amber-500/40 dark:bg-amber-500/10'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-amber-600 dark:text-amber-400">
              Pending Approval
            </span>
            <ClockIcon className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
            {pendingCount}
          </div>
          <p className="text-xs text-slate-500 mt-1">Requires Warden Review</p>
        </div>

        <div
          onClick={() => setFilter('approved')}
          className={`cursor-pointer p-4 rounded-xl border transition ${
            filter === 'approved'
              ? 'bg-emerald-500/10 border-emerald-500/40 dark:bg-emerald-500/10'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400">
              Approved Kiosks
            </span>
            <CheckCircleIcon className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
            {approvedCount}
          </div>
          <p className="text-xs text-slate-500 mt-1">Active & Provisioned</p>
        </div>

        <div
          onClick={() => setFilter('rejected')}
          className={`cursor-pointer p-4 rounded-xl border transition ${
            filter === 'rejected'
              ? 'bg-rose-500/10 border-rose-500/40 dark:bg-rose-500/10'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-rose-600 dark:text-rose-400">
              Rejected Requests
            </span>
            <XCircleIcon className="w-5 h-5 text-rose-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
            {rejectedCount}
          </div>
          <p className="text-xs text-slate-500 mt-1">Access Denied</p>
        </div>

        <div
          onClick={() => setFilter('all')}
          className={`cursor-pointer p-4 rounded-xl border transition ${
            filter === 'all'
              ? 'bg-blue-500/10 border-blue-500/40 dark:bg-blue-500/10'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-400">
              Total Requests
            </span>
            <ServerIcon className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
            {requests.length}
          </div>
          <p className="text-xs text-slate-500 mt-1">All Recorded Logs</p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-2">
          <FunnelIcon className="w-5 h-5 text-slate-400" />
          {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                filter === tab
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab === 'pending' ? `Pending (${pendingCount})` : tab}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search serial, request ID, location..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:w-72 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Requests Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading registration requests...</div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500">
          No registration requests match the selected criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredRequests.map((req) => (
            <div
              key={req.requestId}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-mono text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                    {req.requestId}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-2 flex items-center gap-2">
                    <DevicePhoneMobileIcon className="w-5 h-5 text-slate-400" />
                    {req.deviceBrand} {req.deviceModel}
                  </h3>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    req.status === 'approved'
                      ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                      : req.status === 'rejected'
                      ? 'bg-rose-500/10 text-rose-600 border border-rose-500/30'
                      : 'bg-amber-500/10 text-amber-600 border border-amber-500/30 animate-pulse'
                  }`}
                >
                  {req.status}
                </span>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                <div>
                  <span className="text-slate-400 block">Device Serial</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {req.deviceSerialNumber}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Prison Facility</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <BuildingOfficeIcon className="w-3.5 h-3.5 text-slate-400" />
                    {req.prisonName || req.prisonId}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Location / Wing</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {req.location}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">IP Address</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {req.ipAddress}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Android & App Ver</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {req.androidVersion} | v{req.appVersion}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Requested At</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {new Date(req.registrationTimestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Action Buttons for Pending */}
              {req.status === 'pending' && (
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => handleApprove(req.requestId)}
                    disabled={actionLoading === req.requestId}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Approve Device Registration
                  </button>

                  <button
                    onClick={() => handleReject(req.requestId)}
                    disabled={actionLoading === req.requestId}
                    className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 dark:text-rose-300 rounded-xl text-xs font-bold transition border border-rose-200 dark:border-rose-800"
                  >
                    <XCircleIcon className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};
