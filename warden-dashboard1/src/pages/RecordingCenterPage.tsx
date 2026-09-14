import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { ToastContainer } from '@/components/ToastContainer';
import { wardenApi } from '@/services/api/wardenApi';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import { useToast } from '@/hooks/useToast';
import type { Recording } from '@/services/api/wardenApi';

/**
 * Recording Center Page - Encrypted audio/video call recordings with retention and encryption details.
 */
export function RecordingCenterPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toasts, success, error: toastError, removeToast } = useToast();

  const loadRecordings = useCallback(async () => {
    setLoadError(null);
    try {
      const recordingsData = await wardenApi.getRecordings();
      setRecordings(recordingsData);
    } catch (err) {
      console.error('Failed to load recordings:', err);
      setLoadError('Failed to load recordings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  // Listen for recording updates
  useWardenSocket(
    undefined,
    undefined,
    undefined,
    (updatedRecording) => {
      setRecordings((prev) => {
        const exists = prev.some((r) => r.recordingId === updatedRecording.recordingId);
        if (exists) {
          return prev.map((r) =>
            r.recordingId === updatedRecording.recordingId ? updatedRecording : r
          );
        }
        return [updatedRecording, ...prev];
      });
    }
  );

  if (isLoading) {
    return <Loading message="Loading recordings..." />;
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const kbs = bytes / 1024;
    if (kbs < 1024) return `${Math.round(kbs)} KB`;
    const mbs = kbs / 1024;
    if (mbs < 1024) return `${mbs.toFixed(1)} MB`;
    const gbs = mbs / 1024;
    return `${gbs.toFixed(2)} GB`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success/10 text-success';
      case 'recording':
        return 'bg-error/10 text-error';
      case 'failed':
        return 'bg-error/10 text-error';
      default:
        return 'bg-neutral-100 text-neutral-600';
    }
  };

  const filteredRecordings = recordings.filter((recording) => {
    const matchesSearch =
      recording.recordingId.toLowerCase().includes(search.toLowerCase()) ||
      recording.callId.toLowerCase().includes(search.toLowerCase()) ||
      recording.inmateId.toLowerCase().includes(search.toLowerCase()) ||
      recording.kioskId.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || recording.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Recording Center</h1>
          <p className="text-neutral-600 mt-1">Encrypted audio/video call recordings</p>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search recordings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="recording">Recording</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      <Card>
        {filteredRecordings.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-600">No recordings available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Recording</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Call</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Inmate</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Kiosk</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Duration</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Size</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Encryption</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Retention</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecordings.map((recording) => (
                  <tr key={recording.recordingId} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-3 px-4 text-sm font-medium text-neutral-900">{recording.recordingId}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{recording.callId}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{recording.inmateId}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{recording.kioskId}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{formatDate(recording.startTime)}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{formatDuration(recording.duration)}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{formatSize(recording.size)}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-600">
                        {recording.encryption || 'N/A'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-900">
                      {recording.retentionDays ? `${recording.retentionDays} days` : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(recording.status)}`}>
                        {recording.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        {recording.url && (
                          <a
                            href={recording.url}
                            className="px-3 py-1 bg-primary-600 text-white rounded-md text-sm hover:bg-primary-700 inline-block"
                          >
                            Download
                          </a>
                        )}
                        {recording.status === 'recording' && (
                          <button
                            onClick={async () => {
                              try {
                                await wardenApi.stopRecording(recording.recordingId);
                                success('Recording stopped');
                                loadRecordings();
                              } catch (err) {
                                console.error('Failed to stop recording:', err);
                                toastError('Failed to stop recording');
                              }
                            }}
                            className="px-3 py-1 bg-error text-white rounded-md text-sm hover:bg-error-700"
                          >
                            Stop
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Toast */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}