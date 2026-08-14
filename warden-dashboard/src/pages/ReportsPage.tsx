import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import type { Report } from '@/services/api/wardenApi';

/**
 * Reports Page - Daily, weekly, and monthly operational and financial reports.
 */
export function ReportsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState<Report[]>([]);
  const [typeFilter, setTypeFilter] = useState('all');

  const loadReports = useCallback(async () => {
    try {
      const reportsData = await wardenApi.getReports();
      setReports(reportsData);
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  if (isLoading) {
    return <Loading message="Loading reports..." />;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'daily':
        return 'bg-primary-100 text-primary-600';
      case 'weekly':
        return 'bg-info-100 text-info';
      case 'monthly':
        return 'bg-success/10 text-success';
      default:
        return 'bg-neutral-100 text-neutral-600';
    }
  };

  const filteredReports = reports.filter((report) => {
    return typeFilter === 'all' || report.type === typeFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Reports</h1>
          <p className="text-neutral-600 mt-1">Daily, weekly, and monthly operational reports</p>
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 border-2 border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Periods</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {filteredReports.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-neutral-600">No reports available</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReports.map((report) => (
            <Card key={report.reportId} title={report.name}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeBadge(report.type)}`}>
                    {report.type}
                  </span>
                  <span className="text-sm text-neutral-600">{formatDate(report.generatedAt)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-neutral-600">Period</span>
                  <span className="text-sm font-medium text-neutral-900">{report.period}</span>
                </div>
                {report.totalCalls !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-600">Call Volume</span>
                    <span className="text-sm font-medium text-neutral-900">{report.totalCalls}</span>
                  </div>
                )}
                {report.totalRevenue !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-600">Revenue</span>
                    <span className="text-sm font-medium text-success">₹{report.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {report.failedCalls !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-600">Failed Calls</span>
                    <span className="text-sm font-medium text-error">{report.failedCalls}</span>
                  </div>
                )}
                {report.avgDuration !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-600">Average Duration</span>
                    <span className="text-sm font-medium text-neutral-900">{report.avgDuration} min</span>
                  </div>
                )}
                {report.totalDuration !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-600">Total Duration</span>
                    <span className="text-sm font-medium text-neutral-900">{Math.floor(report.totalDuration / 60)} hrs</span>
                  </div>
                )}
                {report.peakUsage && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-600">Peak Usage</span>
                    <span className="text-sm font-medium text-neutral-900">{report.peakUsage}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-neutral-600">Size</span>
                  <span className="text-sm font-medium text-neutral-900">{report.fileSize}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <a
                    href={report.downloadUrl}
                    className="flex-1 px-3 py-2 bg-primary-600 text-white rounded-md text-sm hover:bg-primary-700 text-center"
                  >
                    Download
                  </a>
                  <button className="px-3 py-2 bg-neutral-200 text-neutral-900 rounded-md text-sm hover:bg-neutral-300">
                    View
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