import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import type { ActiveCall } from '@/services/api/wardenApi';

interface MonitoringCard extends ActiveCall {
  prison: string;
  signalStrength: number;
  networkType: string;
}

/**
 * Live Monitoring Dashboard - Displays every active room as a card with full
 * monitoring metadata. Monitor button opens the dedicated Monitor Screen page.
 */
export function LiveMonitoringPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cards, setCards] = useState<MonitoringCard[]>([]);

  const loadMonitoringData = useCallback(async () => {
    try {
      setLoadError(null);
      const [activeCalls, inmates, devices] = await Promise.all([
        wardenApi.getActiveCalls(),
        wardenApi.getInmates(),
        wardenApi.getDevices(),
      ]);

      const merged: MonitoringCard[] = activeCalls.map((call) => {
        const inmate = inmates.find((i) => i.inmateId === call.inmateId);
        const device = devices.find((d) => d.deviceId === call.kioskId);
        return {
          ...call,
          prison: inmate?.facility || inmate?.prisonId || 'Unknown',
          signalStrength: device?.signalStrength ?? 0,
          networkType: device?.network ?? 'unknown',
        };
      });

      setCards(merged);
    } catch (error) {
      console.error('Failed to load monitoring data:', error);
      setLoadError('Failed to load monitoring data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonitoringData();
  }, [loadMonitoringData]);

  // Listen for real-time updates
  useWardenSocket(
    () => { loadMonitoringData(); },
    undefined,
    () => { loadMonitoringData(); },
    () => { loadMonitoringData(); }
  );

  if (isLoading) {
    return <Loading message="Loading live monitoring..." />;
  }

  if (loadError) {
    return (
      <Card>
        <div className="text-center py-12">
          <p className="text-error mb-4">{loadError}</p>
          <button
            onClick={() => { setIsLoading(true); loadMonitoringData(); }}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'text-success';
      case 'good': return 'text-info';
      case 'fair': return 'text-warning';
      case 'poor': return 'text-error';
      default: return 'text-neutral-600';
    }
  };

  const getIceStateColor = (state: string) => {
    switch (state) {
      case 'connected': return 'text-success';
      case 'checking': return 'text-warning';
      case 'failed': return 'text-error';
      default: return 'text-neutral-600';
    }
  };

  const getRecordingBadge = (status: string) => {
    switch (status) {
      case 'recording': return 'bg-error/10 text-error';
      case 'completed': return 'bg-success/10 text-success';
      case 'failed': return 'bg-error/10 text-error';
      default: return 'bg-neutral-100 text-neutral-600';
    }
  };

  const getSignalColor = (strength: number) => {
    if (strength >= 80) return 'text-success';
    if (strength >= 50) return 'text-warning';
    return 'text-error';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Live Monitoring</h1>
          <p className="text-neutral-600 mt-1">Real-time monitoring of all ongoing calls ({cards.length} active)</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-success/10 text-success rounded-lg text-sm font-medium">
            <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
            Live
          </span>
        </div>
      </div>

      {cards.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-neutral-600">No active calls being monitored</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {cards.map((call) => (
            <Card key={call.callId}>
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900">{call.inmateName || call.inmateId}</h3>
                  <p className="text-sm text-neutral-600">{call.familyMemberName || call.contactId}</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRecordingBadge(call.recordingStatus)}`}>
                  {call.recordingStatus}
                </span>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-neutral-500">Room ID</span>
                  <p className="font-medium text-neutral-900">{call.roomIdLabel || call.roomId}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Prison</span>
                  <p className="font-medium text-neutral-900">{call.prison}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Kiosk</span>
                  <p className="font-medium text-neutral-900">{call.kioskId}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Call Type</span>
                  <p className="font-medium text-neutral-900 capitalize">{call.type}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Duration</span>
                  <p className="font-medium text-neutral-900">{formatDuration(call.durationMinutes * 60)}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Signal Strength</span>
                  <p className={`font-medium ${getSignalColor(call.signalStrength)}`}>{call.signalStrength}%</p>
                </div>
                <div>
                  <span className="text-neutral-500">Bitrate</span>
                  <p className="font-medium text-neutral-900">{call.bitrate} kbps</p>
                </div>
                <div>
                  <span className="text-neutral-500">Packet Loss</span>
                  <p className={`font-medium ${call.packetLoss > 5 ? 'text-error' : 'text-neutral-900'}`}>{call.packetLoss}%</p>
                </div>
                <div>
                  <span className="text-neutral-500">Network Type</span>
                  <p className="font-medium text-neutral-900 capitalize">{call.networkType}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Connection State</span>
                  <p className={`font-medium capitalize ${getIceStateColor(call.iceState)}`}>{call.iceState}</p>
                </div>
              </div>

              {/* Quality indicator */}
              <div className="mt-4 flex items-center justify-between border-t border-neutral-200 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">Quality:</span>
                  <span className={`text-sm font-medium capitalize ${getQualityColor(call.connectionQuality)}`}>
                    {call.connectionQuality}
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/monitoring/live/${call.callId}`)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
                >
                  Monitor
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}