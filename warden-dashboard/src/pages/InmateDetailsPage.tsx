import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import type { Inmate, Device } from '@/services/api/wardenApi';

/**
 * Inmate Details Page - Inmate identity, prison details, and verification records.
 */
export function InmateDetailsPage() {
  const { inmateId } = useParams<{ inmateId: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [inmate, setInmate] = useState<Inmate | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    const loadInmateDetails = async () => {
      try {
        const [inmates, devicesData] = await Promise.all([
          wardenApi.getInmates(),
          wardenApi.getDevices(),
        ]);
        const foundInmate = inmates.find((i) => i.inmateId === inmateId) || inmates[0] || null;
        setInmate(foundInmate);
        setDevices(devicesData);
      } catch (error) {
        console.error('Failed to load inmate details:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInmateDetails();
  }, [inmateId]);

  if (isLoading) {
    return <Loading message="Loading inmate details..." />;
  }

  if (!inmate) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Inmate Details</h1>
          <p className="text-neutral-600 mt-1">Inmate identity and verification records</p>
        </div>
        <Card>
          <div className="text-center py-12">
            <p className="text-neutral-600">Inmate not found</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Inmate Details</h1>
        <p className="text-neutral-600 mt-1">Inmate identity and verification records</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Inmate Profile">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {inmate.photoUrl && (
                <img src={inmate.photoUrl} alt={inmate.firstName} className="w-16 h-16 rounded-full" />
              )}
              <div>
                <p className="text-lg font-semibold text-neutral-900">{inmate.firstName} {inmate.lastName}</p>
                <p className="text-sm text-neutral-600">{inmate.inmateId}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-neutral-600">Facility</p>
              <p className="text-lg font-semibold text-neutral-900">{inmate.facility}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-600">Cell Block</p>
              <p className="text-lg font-semibold text-neutral-900">{inmate.cellBlock}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-600">Security Level</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                inmate.securityLevel === 'High' ? 'bg-error/10 text-error' :
                inmate.securityLevel === 'Medium' ? 'bg-warning/10 text-warning' :
                'bg-success/10 text-success'
              }`}>
                {inmate.securityLevel}
              </span>
            </div>
            <div>
              <p className="text-sm text-neutral-600">Status</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                inmate.status === 'active' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
              }`}>
                {inmate.status}
              </span>
            </div>
          </div>
        </Card>

        <Card title="Sentence Details">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-neutral-600">Prison ID</p>
              <p className="text-lg font-semibold text-neutral-900">{inmate.prisonId}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-600">Sentence</p>
              <p className="text-lg font-semibold text-neutral-900">{inmate.sentenceDetails}</p>
            </div>
          </div>
        </Card>

        <Card title="Quick Actions">
          <div className="space-y-3">
            <button className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">
              View Call History
            </button>
            <button className="w-full px-4 py-2 bg-neutral-200 text-neutral-900 rounded-md hover:bg-neutral-300">
              View Recordings
            </button>
          </div>
        </Card>
      </div>

      <Card title={`All Devices (${devices.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-600 border-b border-neutral-200">
                <th className="py-2 pr-4 font-medium">Device ID</th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Location</th>
                <th className="py-2 pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.deviceId} className="border-b border-neutral-100 last:border-0">
                  <td className="py-2 pr-4 text-neutral-900">{device.deviceId}</td>
                  <td className="py-2 pr-4 text-neutral-900">{device.name}</td>
                  <td className="py-2 pr-4 text-neutral-600">{device.location}</td>
                  <td className="py-2 pr-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      device.status === 'online' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                    }`}>
                      {device.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}