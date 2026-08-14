import { apiClient } from './client';
import type { ApiResponse, Prison, ServerHealth, Subscription, Pricing, StorageStats } from '@/types/api';

export const vendorApi = {
  getPrisons: () => apiClient.get<any, ApiResponse<Prison[]>>('/prisons'),
  getPrison: (id: string) => apiClient.get<any, ApiResponse<Prison>>(`/prisons/${id}`),
  addPrison: (data: Partial<Prison>) => apiClient.post<any, ApiResponse<Prison>>('/prisons', data),
  updatePrison: (id: string, data: Partial<Prison>) => apiClient.patch<any, ApiResponse<Prison>>(`/prisons/${id}`, data),
  
  getSubscriptions: () => apiClient.get<any, ApiResponse<Subscription[]>>('/subscriptions'),
  getServers: () => apiClient.get<any, ApiResponse<ServerHealth[]>>('/servers'),
  getPricing: () => apiClient.get<any, ApiResponse<Pricing>>('/pricing'),
  getStorageStats: () => apiClient.get<any, ApiResponse<StorageStats>>('/storage-stats'),
  
  getActiveCalls: () => apiClient.get<any, ApiResponse<any[]>>('/calls/active'),
  getReports: () => apiClient.get<any, ApiResponse<any[]>>('/reports'),
  getSettings: () => apiClient.get<any, ApiResponse<any>>('/settings'),
};
