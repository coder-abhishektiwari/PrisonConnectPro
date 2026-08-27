import { apiClient } from './client';
import type { ApiResponse } from '@/types/api';

export interface ActiveCall {
  callId: string;
  roomId: string;
  inmateId: string;
  contactId: string;
  kioskId: string;
  type: 'audio' | 'video';
  status: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number;
  recordingEnabled: boolean;
  recordingStatus: string;
  connectionQuality: string;
  bitrate: number;
  packetLoss: number;
  jitter: number;
  iceState: string;
  inmateName?: string;
  familyMemberName?: string;
  roomIdLabel?: string;
}

export interface CallHistoryItem {
  callId: string;
  roomId: string;
  inmateId: string;
  contactId: string;
  kioskId: string;
  type: 'audio' | 'video';
  status: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  recordingEnabled?: boolean;
  recordingStatus?: string;
  connectionQuality?: string;
  inmateName?: string;
  familyMemberName?: string;
}

export interface Recording {
  recordingId: string;
  callId: string;
  inmateId: string;
  kioskId: string;
  startTime: string;
  endTime: string | null;
  duration: number;
  size: number;
  url: string | null;
  encryptionKey: string | null;
  encryption?: string;
  retentionDays?: number;
  status: string;
}

export interface Alert {
  alertId: string;
  type: string;
  severity: string;
  message: string;
  source: string;
  sourceId: string;
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export interface Device {
  deviceId: string;
  type: string;
  name: string;
  location: string;
  status: string;
  ipAddress: string;
  lastSeen: string;
  firmwareVersion: string;
  batteryLevel: number;
  signalStrength: number;
  cpu?: number;
  ram?: number;
  network?: string;
  camera?: string;
  microphone?: string;
  printer?: string;
}

export interface Report {
  reportId: string;
  name: string;
  type: string;
  generatedAt: string;
  period: string;
  totalCalls?: number;
  totalDuration?: number;
  totalRevenue?: number;
  failedCalls?: number;
  avgDuration?: number;
  peakUsage?: string;
  fileSize: string;
  downloadUrl: string;
}

export interface Inmate {
  inmateId: string;
  firstName: string;
  lastName: string;
  prisonId: string;
  facility: string;
  cellBlock: string;
  status: string;
  photoUrl: string;
  securityLevel: string;
  sentenceDetails: string;
}

export interface Contact {
  id: string;
  inmateId: string;
  fullName: string;
  relationship: string;
  phoneNumber: string;
  isApproved: boolean;
  photoUrl: string;
  lastCallDate: string;
  nextScheduledCallDate: string | null;
}

export interface Wallet {
  walletId: string;
  inmateId: string;
  balance: number;
  currency: string;
  lastRechargeAmount: number;
  lastRechargeDate: string;
  totalSpent: number;
  remainingMinutes: number;
}

export interface Schedule {
  scheduleId: string;
  inmateId: string;
  contactId: string;
  kioskId: string;
  date: string;
  timeSlot: string;
  callType: string;
  status: string;
  createdAt: string;
}

export interface Settings {
  callSettings: {
    defaultCallType?: string;
    /** Backend key used by POST /calls — the warden-controlled max call length. */
    maxCallDurationMinutes: number;
    maxDuration?: number;
    recordingEnabled?: boolean;
    autoTerminate?: boolean;
  };
  systemSettings: {
    smsNotifications: boolean;
    emailNotifications: boolean;
    maintenanceMode: boolean;
  };
  securitySettings: {
    maxLoginAttempts: number;
    lockoutDuration: number;
    sessionTimeout: number;
  };
}

export interface Pricing {
  audio?: { ratePerMinute?: number; currency?: string };
  video?: { ratePerMinute?: number; currency?: string };
  tax?: Record<string, unknown>;
  billingRules?: Record<string, unknown>;
}

export interface DashboardStats {
  activeCalls: number;
  activeRecordings: number;
  onlineKiosks: number;
  offlineKiosks: number;
  totalKiosks: number;
  todayCalls: number;
  failedCalls: number;
  alerts: number;
  revenueToday: number;
}

export interface Incident {
  incidentId: string;
  category: string;
  severity: string;
  remarks: string;
  time: string;
  officerName: string;
  callId?: string | null;
  createdAt: string;
}

export interface CallStatistics {
  callId: string;
  packetLoss: number;
  latency: number;
  bitrate: number;
  jitter: number;
  audioLevel: number;
  fps: number;
  networkHealth: string;
  timestamp: string;
}

export interface CallControlEvent {
  callId: string;
  action: string;
  target?: string;
  timestamp: string;
  appliedBy: string;
}

export interface SecurityStatus {
  faceVerification: string;
  rfidVerification: string;
  otpVerification: string;
  browserVerification: string;
  deviceFingerprint: string;
  ipAddress: string;
  location: string;
  vpnStatus: string;
  developerMode: string;
}

export const wardenApi = {
  // Active Calls
  getActiveCalls: () =>
    apiClient.get<ApiResponse<ActiveCall[]>>('/calls/active').then((r) => r.data?.data ?? []),

  // All Calls
  getAllCalls: () =>
    apiClient.get<ApiResponse<ActiveCall[]>>('/calls').then((r) => r.data?.data ?? []),

  // Call by ID
  getCall: (callId: string) =>
    apiClient.get<ApiResponse<ActiveCall>>(`/calls/${callId}`).then((r) => r.data?.data),

  // Update Call
  updateCall: (callId: string, updates: Partial<ActiveCall>) =>
    apiClient.patch<ApiResponse<ActiveCall>>(`/calls/${callId}`, updates).then((r) => r.data?.data),

  // Call History
  getCallHistory: () =>
    apiClient.get<ApiResponse<CallHistoryItem[]>>('/calls/history').then((r) => r.data?.data ?? []),

  // Recordings
  getRecordings: () =>
    apiClient.get<ApiResponse<Recording[]>>('/recordings').then((r) => r.data?.data ?? []),

  getRecording: (recordingId: string) =>
    apiClient.get<ApiResponse<Recording>>(`/recordings/${recordingId}`).then((r) => r.data?.data),

  startRecording: (recordingId: string) =>
    apiClient.post<ApiResponse<Recording>>(`/recordings/${recordingId}/start`).then((r) => r.data?.data),

  stopRecording: (recordingId: string) =>
    apiClient.post<ApiResponse<Recording>>(`/recordings/${recordingId}/stop`).then((r) => r.data?.data),

  // Alerts
  getAlerts: () =>
    apiClient.get<ApiResponse<Alert[]>>('/alerts').then((r) => r.data?.data ?? []),

  resolveAlert: (alertId: string, resolvedBy: string) =>
    apiClient.patch<ApiResponse<Alert>>(`/alerts/${alertId}/resolve`, { resolvedBy }).then((r) => r.data?.data),

  // Devices
  getDevices: () =>
    apiClient.get<ApiResponse<Device[]>>('/devices').then((r) => r.data?.data ?? []),

  getDevice: (deviceId: string) =>
    apiClient.get<ApiResponse<Device>>(`/devices/${deviceId}`).then((r) => r.data?.data),

  updateDeviceStatus: (deviceId: string, status: string) =>
    apiClient.patch<ApiResponse<Device>>(`/devices/${deviceId}/status`, { status }).then((r) => r.data?.data),

  // Reports
  getReports: () =>
    apiClient.get<ApiResponse<Report[]>>('/reports').then((r) => r.data?.data ?? []),

  getReport: (reportId: string) =>
    apiClient.get<ApiResponse<Report>>(`/reports/${reportId}`).then((r) => r.data?.data),

  // Inmates
  getInmates: () =>
    apiClient.get<ApiResponse<Inmate[]>>('/inmates').then((r) => r.data?.data ?? []),

  getInmate: (inmateId: string) =>
    apiClient.get<ApiResponse<Inmate>>(`/inmates/${inmateId}`).then((r) => r.data?.data),

  // Contacts
  getContacts: () =>
    apiClient.get<ApiResponse<Contact[]>>('/contacts').then((r) => r.data?.data ?? []),

  // Wallets
  getWallets: () =>
    apiClient.get<ApiResponse<Wallet[]>>('/wallets').then((r) => r.data?.data ?? []),

  getWallet: (inmateId: string) =>
    apiClient.get<ApiResponse<Wallet>>(`/wallets/${inmateId}`).then((r) => r.data?.data),

  // Schedule
  getSchedule: () =>
    apiClient.get<ApiResponse<Schedule[]>>('/schedule').then((r) => r.data?.data ?? []),

  // Settings
  getSettings: () =>
    apiClient.get<ApiResponse<Settings>>('/settings').then((r) => r.data?.data),

  updateSettings: (settings: Partial<Settings>) =>
    apiClient.patch<ApiResponse<Settings>>('/settings', settings).then((r) => r.data?.data),

  // Pricing (per-minute call rates set by the warden)
  getPricing: () =>
    apiClient.get<ApiResponse<Pricing>>('/pricing').then((r) => r.data?.data),

  updatePricing: (pricing: Partial<Pricing>) =>
    apiClient.patch<ApiResponse<Pricing>>('/pricing', pricing).then((r) => r.data?.data),

  // Incidents
  getIncidents: () =>
    apiClient.get<ApiResponse<Incident[]>>('/incidents').then((r) => r.data?.data ?? []),

  createIncident: (incident: Partial<Incident>) =>
    apiClient.post<ApiResponse<Incident>>('/incidents', incident).then((r) => r.data?.data),

  getIncident: (incidentId: string) =>
    apiClient.get<ApiResponse<Incident>>(`/incidents/${incidentId}`).then((r) => r.data?.data),

  // Statistics
  getStatistics: () =>
    apiClient.get<ApiResponse<CallStatistics[]>>('/statistics').then((r) => r.data?.data ?? []),

  getCallStatistics: (callId: string) =>
    apiClient.get<ApiResponse<CallStatistics>>(`/statistics/${callId}`).then((r) => r.data?.data),

  updateCallStatistics: (callId: string, updates: Partial<CallStatistics>) =>
    apiClient.patch<ApiResponse<CallStatistics>>(`/statistics/${callId}`, updates).then((r) => r.data?.data),

  // Call Control
  sendCallControl: (callId: string, action: string, target?: string) =>
    apiClient.post<ApiResponse<CallControlEvent>>(`/calls/${callId}/control`, { action, target }).then((r) => r.data?.data),

  // End Call (force disconnect)
  endCall: (callId: string) =>
    apiClient.post<ApiResponse<ActiveCall>>(`/calls/${callId}/end`).then((r) => r.data?.data),

  // Dashboard Stats
  getDashboardStats: async (): Promise<DashboardStats> => {
    try {
      const [callsRes, devicesRes, alertsRes, recordingsRes, reportsRes] = await Promise.allSettled([
        apiClient.get<ApiResponse<ActiveCall[]>>('/calls'),
        apiClient.get<ApiResponse<Device[]>>('/devices'),
        apiClient.get<ApiResponse<Alert[]>>('/alerts'),
        apiClient.get<ApiResponse<Recording[]>>('/recordings'),
        apiClient.get<ApiResponse<Report[]>>('/reports'),
      ]);

      const calls = callsRes.status === 'fulfilled' ? callsRes.value.data?.data ?? [] : [];
      const devices = devicesRes.status === 'fulfilled' ? devicesRes.value.data?.data ?? [] : [];
      const alerts = alertsRes.status === 'fulfilled' ? alertsRes.value.data?.data ?? [] : [];
      const recordings = recordingsRes.status === 'fulfilled' ? recordingsRes.value.data?.data ?? [] : [];
      const reports = reportsRes.status === 'fulfilled' ? reportsRes.value.data?.data ?? [] : [];

      const todayStr = new Date().toDateString();

      const activeCalls = calls.filter((c) => c.status === 'active');
      const activeRecordings = recordings.filter((r) => r.status === 'recording');
      const onlineKiosks = devices.filter((d) => d.status === 'online');
      const offlineKiosks = devices.filter((d) => d.status === 'offline');
      const todayCalls = calls.filter((c) => new Date(c.startTime).toDateString() === todayStr);
      const failedCalls = calls.filter((c) => c.status === 'failed');
      const unresolvedAlerts = alerts.filter((a) => !a.resolved);
      const dailyReport = reports.find((r) => r.type === 'daily');

      return {
        activeCalls: activeCalls.length,
        activeRecordings: activeRecordings.length,
        onlineKiosks: onlineKiosks.length,
        offlineKiosks: offlineKiosks.length,
        totalKiosks: devices.length,
        todayCalls: todayCalls.length,
        failedCalls: failedCalls.length,
        alerts: unresolvedAlerts.length,
        revenueToday: dailyReport?.totalRevenue ?? 0,
      };
    } catch (error) {
      console.error('Failed to fetch dashboard stats', error);
      return {
        activeCalls: 0, activeRecordings: 0, onlineKiosks: 0, offlineKiosks: 0,
        totalKiosks: 0, todayCalls: 0, failedCalls: 0, alerts: 0, revenueToday: 0
      };
    }
  },

  // Kiosk Registration & Authorization
  getKioskRegistrationRequests: () =>
    apiClient.get<ApiResponse<KioskRegistrationRequestItem[]>>('/kiosks/registration-requests').then((r) => r.data?.data ?? []),

  approveKioskRegistration: (requestId: string) =>
    apiClient.put<ApiResponse<{ success: boolean }>>(`/kiosks/registration/${requestId}/approve`).then((r) => r.data?.data ?? { success: false }),

  rejectKioskRegistration: (requestId: string) =>
    apiClient.put<ApiResponse<{ success: boolean }>>(`/kiosks/registration/${requestId}/reject`).then((r) => r.data?.data ?? { success: false }),

  getSetupPin: (prisonId: string) =>
    apiClient.get<ApiResponse<SetupPinData>>(`/kiosks/setup-pin/${prisonId}`).then((r) => r.data?.data),

  updateSetupPin: (prisonId: string, pin: string) =>
    apiClient.put<ApiResponse<{ success: boolean }>>('/kiosks/setup-pin', { prisonId, pin }).then((r) => r.data?.data ?? { success: false }),

  // User Management
  getWardens: () =>
    apiClient.get<ApiResponse<any[]>>('/wardens').then((r) => r.data?.data ?? []),

  getWarden: (wardenId: string) =>
    apiClient.get<ApiResponse<any>>(`/wardens/${wardenId}`).then((r) => r.data?.data),

  // Prisons
  getPrisons: () =>
    apiClient.get<ApiResponse<any[]>>('/prisons').then((r) => r.data?.data ?? []),

  getPrison: (prisonId: string) =>
    apiClient.get<ApiResponse<any>>(`/prisons/${prisonId}`).then((r) => r.data?.data),

  // Subscriptions
  getSubscriptions: () =>
    apiClient.get<ApiResponse<any[]>>('/subscriptions').then((r) => r.data?.data ?? []),
};

export interface KioskRegistrationRequestItem {
  requestId: string;
  prisonId: string;
  prisonName?: string;
  deviceSerialNumber: string;
  deviceModel: string;
  deviceBrand: string;
  ipAddress: string;
  location: string;
  androidVersion: string;
  appVersion: string;
  registrationTimestamp: string;
  deviceFingerprint: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface SetupPinData {
  prisonId: string;
  pin: string;
  updatedAt?: string | null;
}