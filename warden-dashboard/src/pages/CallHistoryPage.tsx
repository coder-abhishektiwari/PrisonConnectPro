import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import type { CallHistoryItem } from '@/services/api/wardenApi';

/**
 * Call History Page - Complete history of all inmate calls.
 */
export function CallHistoryPage() {
  const { inmateId } = useParams<{ inmateId: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);

  useEffect(() => {
    const loadCalls = async () => {
      try {
        const callHistory = await wardenApi.getCallHistory();
        setCalls(callHistory);
      } catch (error) {
        console.error('Failed to load call history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadCalls();
  }, [inmateId]);

  if (isLoading) {
    return <Loading message="Loading call history..." />;
  }

  const formatDuration = (minutes: number) => {
    const mins = Math.floor(minutes);
    const secs = Math.floor((minutes % 1) * 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Call History</h1>
        <p className="text-neutral-600 mt-1">Complete history of all inmate calls</p>
      </div>

      <Card>
        {calls.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-600">No call history available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Call ID</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Inmate</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Contact</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Kiosk</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Type</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Duration</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.callId} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-3 px-4 text-sm text-neutral-900">{call.callId}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{formatDate(call.startTime)}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{call.inmateId}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{call.contactId}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{call.kioskId}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900 capitalize">{call.type}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{formatDuration(call.durationMinutes)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        call.status === 'completed' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                      }`}>
                        {call.status}
                      </span>
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
