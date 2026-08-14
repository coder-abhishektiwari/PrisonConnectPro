import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import type { Alert } from '@/services/api/wardenApi';

/**
 * Alerts Center Page - Real-time threat alerts and system events.
 */
export function AlertsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const loadAlerts = useCallback(async () => {
    try {
      const alertsData = await wardenApi.getAlerts();
      setAlerts(alertsData);
    } catch (error) {
      console.error('Failed to load alerts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Listen for new alerts
  useWardenSocket(
    undefined,
    (newAlert) => {
      setAlerts((prev) => [newAlert, ...prev]);
    }
  );

  if (isLoading) {
    return <Loading message="Loading alerts..." />;
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-error/10 text-error';
      case 'medium':
        return 'bg-warning/10 text-warning';
      case 'low':
        return 'bg-info-100 text-info';
      default:
        return 'bg-neutral-100 text-neutral-900';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'network':
        return 'M13 10V3L4 14h7v7l9-11h-7z';
      case 'camera':
        return 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z';
      case 'recording':
        return 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z';
      case 'security':
        return 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z';
      case 'device':
        return 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z';
      default:
        return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  const handleResolve = async (alertId: string) => {
    try {
      await wardenApi.resolveAlert(alertId, 'warden-001');
      setAlerts((prev) => prev.map((alert) => 
        alert.alertId === alertId ? { ...alert, resolved: true } : alert
      ));
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSeverity = severityFilter === 'all' || alert.severity === severityFilter;
    const matchesType = typeFilter === 'all' || alert.type === typeFilter;
    return matchesSeverity && matchesType;
  });

  const alertTypes = ['all', ...new Set(alerts.map((a) => a.type))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Alerts Center</h1>
          <p className="text-neutral-600 mt-1">Real-time threat alerts and system events</p>
        </div>
        <div className="flex gap-3">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Severity</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {alertTypes.map((type) => (
              <option key={type} value={type}>{type === 'all' ? 'All Types' : type}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredAlerts.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-neutral-600">No alerts match your filters</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredAlerts.map((alert) => (
            <Card key={alert.alertId}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm text-neutral-600 capitalize">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={getTypeIcon(alert.type)} />
                      </svg>
                      {alert.type}
                    </span>
                    {alert.resolved && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                        Resolved
                      </span>
                    )}
                  </div>
                  <p className="text-neutral-900 font-medium">{alert.message}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-sm text-neutral-600">{formatTime(alert.timestamp)}</p>
                    <p className="text-sm text-neutral-400">•</p>
                    <p className="text-sm text-neutral-600">{alert.sourceId}</p>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  {!alert.resolved && (
                    <button 
                      onClick={() => handleResolve(alert.alertId)}
                      className="px-3 py-1 bg-primary-600 text-white rounded-md text-sm hover:bg-primary-700"
                    >
                      Resolve
                    </button>
                  )}
                  <button className="px-3 py-1 bg-neutral-200 text-neutral-900 rounded-md text-sm hover:bg-neutral-300">
                    Investigate
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}