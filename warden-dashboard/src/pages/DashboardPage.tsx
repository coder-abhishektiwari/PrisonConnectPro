import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/DataTable';
import { wardenApi } from '@/services/api/wardenApi';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import type { DashboardStats, ActiveCall, Alert, Device } from '@/services/api/wardenApi';

const initialStats: DashboardStats = {
  activeCalls: 0,
  activeRecordings: 0,
  onlineKiosks: 0,
  offlineKiosks: 0,
  totalKiosks: 0,
  todayCalls: 0,
  failedCalls: 0,
  alerts: 0,
  revenueToday: 0,
};

/**
 * Dashboard Page - Operations Console overview with live widgets.
 */
export function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoadError(null);
    try {
      const [dashboardStats, calls, alertsData, devicesData] = await Promise.all([
        wardenApi.getDashboardStats(),
        wardenApi.getActiveCalls(),
        wardenApi.getAlerts(),
        wardenApi.getDevices(),
      ]);
      setStats(dashboardStats);
      setActiveCalls(calls ?? []);
      setAlerts(alertsData ?? []);
      setDevices(devicesData ?? []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setLoadError('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Auto-refresh when mock data changes via socket events
  useWardenSocket(
    () => { loadStats(); },
    () => { loadStats(); },
    () => { loadStats(); },
    () => { loadStats(); }
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-neutral-200 rounded w-64 mb-2"></div>
          <div className="h-4 bg-neutral-200 rounded w-96"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 animate-pulse">
              <div className="h-4 bg-neutral-200 rounded w-24 mb-3"></div>
              <div className="h-8 bg-neutral-200 rounded w-32 mb-2"></div>
              <div className="h-3 bg-neutral-200 rounded w-20"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Operations Console</h1>
          <p className="text-neutral-600 mt-1">Real-time monitoring dashboard</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
          <p className="text-error mb-4">{loadError}</p>
          <button
            onClick={() => { setIsLoading(true); loadStats(); }}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const callColumns = [
    { key: 'inmateName', header: 'Inmate', sortable: true },
    { key: 'familyMemberName', header: 'Contact', sortable: true },
    { key: 'type', header: 'Type', sortable: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'durationMinutes', header: 'Duration (min)', sortable: true },
    { key: 'connectionQuality', header: 'Quality', sortable: true, render: (item: ActiveCall) => getQualityBadge(item.connectionQuality) },
  ];

  const alertColumns = [
    { key: 'type', header: 'Type', sortable: true },
    { key: 'severity', header: 'Severity', sortable: true, render: (item: Alert) => getSeverityBadge(item.severity) },
    { key: 'message', header: 'Message', sortable: true },
    { key: 'source', header: 'Source', sortable: true },
    { key: 'timestamp', header: 'Time', sortable: true },
  ];

  const getSeverityBadge = (severity: string) => {
    const colors = {
      critical: 'bg-error-50 text-error-700 border-error-200',
      high: 'bg-warning-50 text-warning-700 border-warning-200',
      medium: 'bg-info-50 text-info-700 border-info-200',
      low: 'bg-neutral-100 text-neutral-700 border-neutral-200',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${colors[severity as keyof typeof colors] || colors.low}`}>
        {severity}
      </span>
    );
  };

  const getQualityBadge = (quality: string) => {
    const colors = {
      excellent: 'text-success',
      good: 'text-success',
      fair: 'text-warning',
      poor: 'text-error',
    };
    return <span className={`text-sm font-medium ${colors[quality as keyof typeof colors] || 'text-neutral-600'}`}>{quality}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Operations Console</h1>
        <p className="text-neutral-600 mt-1">Real-time system overview and statistics</p>
      </div>

      {/* First Row - Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Active Prisons"
          value={stats.totalKiosks}
          subtitle={`${stats.onlineKiosks} online`}
          icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m4 0h2"
          color="primary"
        />
        <StatCard
          title="Active Calls"
          value={stats.activeCalls}
          subtitle="Currently ongoing"
          icon="M3 5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm3 2h12M7 12h4m-4 4h8"
          color="success"
        />
        <StatCard
          title="Active Recordings"
          value={stats.activeRecordings}
          subtitle="Recording now"
          icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          color="error"
        />
        <StatCard
          title="Today's Revenue"
          value={`₹${stats.revenueToday.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtitle="Daily total"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          color="success"
        />
        <StatCard
          title="Online Servers"
          value={stats.onlineKiosks}
          subtitle={`of ${stats.totalKiosks} total`}
          icon="M5 13l4 4L19 7"
          color="primary"
        />
        <StatCard
          title="System Health"
          value={`${stats.totalKiosks > 0 ? Math.round((stats.onlineKiosks / stats.totalKiosks) * 100) : 0}%`}
          subtitle={`${stats.offlineKiosks} offline`}
          icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          color="success"
        />
      </div>

      {/* Second Row - Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Live Calls Table */}
        <DataTable
          data={activeCalls}
          columns={callColumns}
          title="Live Calls"
          subtitle={`${activeCalls.length} active calls`}
          searchable
          searchPlaceholder="Search calls..."
          pageSize={5}
          loading={isLoading}
          emptyState={
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-neutral-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm3 2h12M7 12h4m-4 4h8" />
              </svg>
              <p className="text-neutral-600">No active calls</p>
            </div>
          }
        />

        {/* Recent Alerts */}
        <DataTable
          data={alerts.slice(0, 10)}
          columns={alertColumns}
          title="Recent Alerts"
          subtitle={`${alerts.filter(a => !a.resolved).length} unresolved`}
          searchable
          searchPlaceholder="Search alerts..."
          pageSize={5}
          loading={isLoading}
          emptyState={
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-neutral-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p className="text-neutral-600">No active alerts</p>
            </div>
          }
        />
      </div>

      {/* Third Row - Additional Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Infrastructure Status */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Infrastructure Status</h3>
          <div className="space-y-3">
            {devices.slice(0, 5).map((device) => (
              <div key={device.deviceId} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${device.status === 'online' ? 'bg-success' : 'bg-error'}`}></div>
                  <span className="text-sm text-neutral-900">{device.name}</span>
                </div>
                <span className={`text-xs font-medium ${device.status === 'online' ? 'text-success' : 'text-error'}`}>
                  {device.status}
                </span>
              </div>
            ))}
          </div>
          <Link to="/devices">
            <button className="w-full mt-4 px-4 py-2 text-sm text-primary-600 border border-primary-600 rounded-lg hover:bg-primary-50 transition-colors">
              View All Devices
            </button>
          </Link>
        </div>

        {/* Call Statistics */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Call Statistics</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-neutral-600">Success Rate</span>
                <span className="font-medium text-neutral-900">
                  {stats.todayCalls > 0 ? Math.round(((stats.todayCalls - stats.failedCalls) / stats.todayCalls) * 100) : 0}%
                </span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div
                  className="bg-success h-2 rounded-full"
                  style={{ width: `${stats.todayCalls > 0 ? ((stats.todayCalls - stats.failedCalls) / stats.todayCalls) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-neutral-600">Active Now</span>
                <span className="font-medium text-neutral-900">{stats.activeCalls}</span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full"
                  style={{ width: `${Math.min(stats.activeCalls * 10, 100)}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-neutral-600">Failed Calls</span>
                <span className="font-medium text-neutral-900">{stats.failedCalls}</span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div
                  className="bg-error h-2 rounded-full"
                  style={{ width: `${Math.min(stats.failedCalls * 10, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Storage Usage */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Storage Usage</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-neutral-600">Recordings</span>
                <span className="font-medium text-neutral-900">
                  {stats.activeRecordings} GB
                </span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div
                  className="bg-warning h-2 rounded-full"
                  style={{ width: `${Math.min(stats.activeRecordings * 5, 100)}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-neutral-600">Database</span>
                <span className="font-medium text-neutral-900">45%</span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div className="bg-primary-600 h-2 rounded-full" style={{ width: '45%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-neutral-600">Cache</span>
                <span className="font-medium text-neutral-900">32%</span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div className="bg-info h-2 rounded-full" style={{ width: '32%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}