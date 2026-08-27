import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { CallDetailsDrawer } from '@/components/CallDetailsDrawer';
import { wardenApi } from '@/services/api/wardenApi';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import type { ActiveCall } from '@/services/api/wardenApi';

const PAGE_SIZE = 10;

/**
 * Active Calls Page - Enterprise data table of currently ongoing inmate calls.
 */
export function ActiveCallsPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [calls, setCalls] = useState<ActiveCall[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [qualityFilter, setQualityFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCall, setSelectedCall] = useState<ActiveCall | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmForceEnd, setConfirmForceEnd] = useState<ActiveCall | null>(null);

  const loadCalls = useCallback(async () => {
    try {
      const activeCalls = await wardenApi.getActiveCalls();
      setCalls(activeCalls);
    } catch (error) {
      console.error('Failed to load active calls:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  // Listen for real-time updates
  useWardenSocket(
    () => { loadCalls(); },
    undefined,
    undefined,
    undefined
  );

  if (isLoading) {
    return <Loading message="Loading active calls..." />;
  }

  const formatDuration = (minutes: number) => {
    const mins = Math.floor(minutes);
    const secs = Math.floor((minutes % 1) * 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getQualityBadge = (quality: string) => {
    switch (quality) {
      case 'excellent':
        return 'bg-success/10 text-success';
      case 'good':
        return 'bg-info-100 text-info';
      case 'fair':
        return 'bg-warning/10 text-warning';
      case 'poor':
        return 'bg-error/10 text-error';
      default:
        return 'bg-neutral-100 text-neutral-600';
    }
  };

  const getRecordingBadge = (status: string) => {
    switch (status) {
      case 'recording':
        return 'bg-error/10 text-error';
      case 'completed':
        return 'bg-success/10 text-success';
      case 'failed':
        return 'bg-error/10 text-error';
      default:
        return 'bg-neutral-100 text-neutral-600';
    }
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleForceEnd = async (call: ActiveCall) => {
    try {
      await wardenApi.endCall(call.callId);
      showToast(`Call ${call.callId} force ended`);
      loadCalls();
    } catch (error) {
      console.error('Failed to force end call:', error);
      showToast('Failed to end call');
    }
  };

  const handleMarkIncident = (call: ActiveCall) => {
    showToast(`Incident marked for call ${call.callId}`);
  };

  const filteredCalls = calls.filter((call) => {
    const matchesSearch =
      call.callId.toLowerCase().includes(search.toLowerCase()) ||
      (call.inmateName || '').toLowerCase().includes(search.toLowerCase()) ||
      (call.familyMemberName || '').toLowerCase().includes(search.toLowerCase()) ||
      call.inmateId.toLowerCase().includes(search.toLowerCase()) ||
      call.kioskId.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || call.type === typeFilter;
    const matchesQuality = qualityFilter === 'all' || call.connectionQuality === qualityFilter;
    return matchesSearch && matchesType && matchesQuality;
  });

  const totalPages = Math.max(1, Math.ceil(filteredCalls.length / PAGE_SIZE));
  const paginatedCalls = filteredCalls.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Active Calls</h1>
        <p className="text-neutral-600 mt-1">Currently ongoing inmate calls</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by call ID, inmate, family, kiosk..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          className="flex-1 px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
          className="px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Types</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
        </select>
        <select
          value={qualityFilter}
          onChange={(e) => { setQualityFilter(e.target.value); setCurrentPage(1); }}
          className="px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Quality</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
        </select>
      </div>

      <Card>
        {filteredCalls.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-600">No active calls match your filters</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Inmate</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Family Member</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Room ID</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Call Type</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Duration</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Recording</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Connection</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCalls.map((call) => (
                    <tr key={call.callId} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium text-neutral-900">{call.inmateName || call.inmateId}</p>
                        <p className="text-xs text-neutral-600">{call.inmateId}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-neutral-900">{call.familyMemberName || call.contactId}</p>
                        <p className="text-xs text-neutral-600">{call.contactId}</p>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-900">{call.roomIdLabel || call.roomId}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          call.type === 'video' ? 'bg-primary-100 text-primary-600' : 'bg-info-100 text-info'
                        }`}>
                          {call.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-900">{formatDuration(call.durationMinutes)}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRecordingBadge(call.recordingStatus)}`}>
                          {call.recordingStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getQualityBadge(call.connectionQuality)}`}>
                          {call.connectionQuality}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                          Active
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedCall(call)}
                            className="px-2 py-1 bg-primary-600 text-white rounded-md text-xs hover:bg-primary-700"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => navigate(`/monitoring/live/${call.callId}`)}
                            className="px-2 py-1 bg-info-600 text-white rounded-md text-xs hover:bg-info-700"
                          >
                            Monitor
                          </button>
                           <button
                             onClick={() => setConfirmForceEnd(call)}
                             className="px-2 py-1 bg-error text-white rounded-md text-xs hover:bg-error-700"
                          >
                            Force End
                          </button>
                          <button
                            onClick={() => handleMarkIncident(call)}
                            className="px-2 py-1 bg-warning text-white rounded-md text-xs hover:bg-warning-700"
                          >
                            Incident
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
              <p className="text-sm text-neutral-600">
                Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredCalls.length)} of {filteredCalls.length} calls
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-neutral-100 text-neutral-900 rounded-md text-sm hover:bg-neutral-200 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-neutral-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-neutral-100 text-neutral-900 rounded-md text-sm hover:bg-neutral-200 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Call Details Drawer */}
      <CallDetailsDrawer call={selectedCall} onClose={() => setSelectedCall(null)} />

      {/* Force End Confirmation Dialog */}
      {confirmForceEnd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Force End Call?</h3>
            <p className="text-sm text-neutral-600 mb-4">
              This will immediately disconnect the active call <strong>{confirmForceEnd.callId}</strong> between{' '}
              <strong>{confirmForceEnd.inmateName || confirmForceEnd.inmateId}</strong> and{' '}
              <strong>{confirmForceEnd.familyMemberName || confirmForceEnd.contactId}</strong>.
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmForceEnd(null)}
                className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-lg text-sm hover:bg-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleForceEnd(confirmForceEnd);
                  setConfirmForceEnd(null);
                }}
                className="px-4 py-2 bg-error text-white rounded-lg text-sm hover:bg-error-700 font-medium"
              >
                Force End
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-neutral-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  );
}