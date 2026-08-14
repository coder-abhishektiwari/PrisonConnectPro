import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import type { Device } from '@/services/api/wardenApi';

/**
 * Devices Page - Kiosk health and hardware status monitoring.
 */
export function DevicesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadDevices = useCallback(async () => {
    try {
      const devicesData = await wardenApi.getDevices();
      setDevices(devicesData);
    } catch (error) {
      console.error('Failed to load devices:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Listen for real-time device status changes
  useWardenSocket(
    undefined,
    undefined,
    (updatedDevice) => {
      setDevices((prev) => prev.map((d) =>
        d.deviceId === updatedDevice.deviceId ? updatedDevice : d
      ));
    }
  );

  if (isLoading) {
    return <Loading message="Loading devices..." />;
  }

  const filteredDevices = devices.filter((device) => {
    const matchesSearch =
      device.deviceId.toLowerCase().includes(search.toLowerCase()) ||
      device.name.toLowerCase().includes(search.toLowerCase()) ||
      device.location.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || device.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-success/10 text-success';
      case 'offline':
        return 'bg-error/10 text-error';
      default:
        return 'bg-warning/10 text-warning';
    }
  };

  const getHardwareStatus = (status: string | undefined) => {
    if (!status) return 'bg-neutral-100 text-neutral-600';
    switch (status) {
      case 'operational':
        return 'bg-success/10 text-success';
      case 'degraded':
        return 'bg-warning/10 text-warning';
      case 'failed':
        return 'bg-error/10 text-error';
      default:
        return 'bg-neutral-100 text-neutral-600';
    }
  };

  const formatLastSeen = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-IN');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Devices</h1>
          <p className="text-neutral-600 mt-1">Kiosk health and hardware status</p>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search devices..."
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
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>

      <Card>
        {filteredDevices.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-600">No devices found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Kiosk ID</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Name / Location</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">CPU</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">RAM</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Network</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Camera</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Microphone</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Printer</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-900">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => (
                  <tr key={device.deviceId} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-3 px-4 text-sm font-medium text-neutral-900">{device.deviceId}</td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-neutral-900">{device.name}</p>
                      <p className="text-xs text-neutral-600">{device.location}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(device.status)}`}>
                        {device.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-900">
                      {device.status === 'online' ? `${device.cpu ?? 0}%` : '—'}
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-900">
                      {device.status === 'online' ? `${device.ram ?? 0}%` : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getHardwareStatus(device.network)}`}>
                        {device.network ?? 'unknown'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getHardwareStatus(device.camera)}`}>
                        {device.camera ?? 'unknown'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getHardwareStatus(device.microphone)}`}>
                        {device.microphone ?? 'unknown'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getHardwareStatus(device.printer)}`}>
                        {device.printer ?? 'unknown'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-600">{formatLastSeen(device.lastSeen)}</td>
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