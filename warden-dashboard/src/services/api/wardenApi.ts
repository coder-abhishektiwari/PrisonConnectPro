import { apiClient } from './client';
import type { ApiResponse } from '@/types/api';
import { cachedGet, invalidateCache, invalidatePrefix } from './cache';

/** Warden staff record as returned by GET /wardens (secrets stripped). */
export interface WardenRecord {
  wardenId: string;
  employeeId?: string;
  name: string;
  email: string;
  phone?: string;
  prisonId: string;
  designation?: string;
  permissions?: string[];
  status: string;
  isChiefWarden?: boolean;
  createdBy?: string | null;
  createdAt?: string;
}

export interface NewWardenInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

/** Fields a chief warden may change on an existing warden (password resets too). */
export interface WardenUpdate {
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  password?: string;
}

/** Staff account attached to a kiosk device. */
export interface KioskAdmin {
  adminId: string;
  employeeId?: string;
  name: string;
  email?: string;
  status?: string;
  kioskId: string | null;
  prisonId?: string;
  permissions?: string[];
  createdAt?: string;
  location?: string | null;
  registeredInmates?: number;
}

export interface KioskAdminUpdate {
  name?: string;
  /** The username the operator types on the kiosk terminal. */
  employeeId?: string;
  email?: string;
  status?: string;
  permissions?: string[];
  password?: string;
}

export interface NewKioskAdminInput {
  name: string;
  employeeId: string;
  email?: string;
  password: string;
}

/**
 * Where the family member was when their device was verified for a call.
 * Written by POST /family/secure-call/location: on the call for that call
 * only, and on the device fingerprint once, forever.
 */
export interface LocationPoint {
  lat: number;
  lng: number;
  accuracy?: number | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  at?: string;
}

export interface ActiveCall {
  callId: string;
  roomId: string;
  inmateId: string;
  contactId: string;
  kioskId: string;
  type: 'audio' | 'video';
  status: string;
  startTime: string;
  /** Set once the kiosk reports media connected; null while still in lobby. */
  mediaConnectedAt?: string | null;
  endTime: string | null;
  durationMinutes: number;
  connectionQuality: string;
  bitrate: number;
  packetLoss: number;
  jitter: number;
  iceState: string;
  inmateName?: string;
  /** Prisoner number (prisonerNumber) — shown to wardens instead of the raw inmateId. */
  inmateNumber?: string | null;
  familyMemberName?: string;
  contactName?: string;
  roomIdLabel?: string;
  /** Family-side state for this call; location is captured at device verify. */
  family?: { location?: LocationPoint };
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
  connectionQuality?: string;
  inmateName?: string;
  inmateNumber?: string | null;
  familyMemberName?: string;
  contactName?: string;
  failReason?: string;
  endReason?: string;
  endReasonDescription?: string;
  callIssues?: Array<{ type: string; description: string; severity: string }>;
  mediaConnectedAt?: string;
  chargeAmount?: number;
  ratePerMinute?: number;
  /** Family-side state for this call; location is captured at device verify. */
  family?: { location?: LocationPoint };
}

export interface PaginatedCallsResponse {
  calls: CallHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface CallHistoryParams {
  limit?: number;
  offset?: number;
  search?: string;
  type?: string;
  status?: string;
  kioskId?: string;
  quality?: string;
  dateFrom?: string;
  dateTo?: string;
  sortField?: string;
  sortDir?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListParams {
  limit?: number;
  offset?: number;
  search?: string;
  sortField?: string;
  sortDir?: string;
  status?: string;
  type?: string;
  facility?: string;
  relationship?: string;
  inmateId?: string;
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

export interface Inmate {
  inmateId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  age?: number | null;
  dateOfAdmission?: string;
  fatherName?: string;
  motherName?: string;
  idProof?: string;
  idNumber?: string;
  religion?: string;
  nationality?: string;
  state?: string;
  district?: string;
  address?: string;
  prisonId: string;
  facility: string;
  kioskName?: string;
  status: string;
  photoUrl: string;
  assignedKioskId?: string;
  prisonerNumber?: string;
}

export interface DeviceFingerprint {
  fingerprintId: string;
  phone?: string;
  hash?: string;
  deviceInfo?: { browser?: string; os?: string; screen?: string; language?: string; model?: string; manufacturer?: string } | null;
  signals?: {
    userAgent?: string;
    platform?: string;
    screen?: string;
    timezone?: string;
    language?: string;
    deviceId?: string;
    hardwareConcurrency?: number;
    deviceMemory?: number | null;
    touchPoints?: number;
  };
  firstSeenAt?: string;
  lastVerifiedAt?: string;
  verifiedCount?: number;
  /** Captured when the device first registered - shown forever, never updated. */
  location?: LocationPoint;
}

export interface Contact {
  contactId: string;
  inmateId: string;
  name: string;
  fullName?: string;
  relationship: string;
  phoneNumber: string;
  phone?: string;
  mobileNumber?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  active: boolean;
  status?: string;
  verified?: boolean;
  photoUrl?: string;
  lastCallDate?: string;
  nextScheduledCallDate?: string | null;
  deviceFingerprints?: DeviceFingerprint[];
}

export interface Wallet {
  walletId: string;
  inmateId: string;
  balance: number;
  currency: string;
  lastRecharge: string;
  lastRechargeAmount: number;
  totalSpent: number;
  totalRecharged?: number;
  remainingMinutes: number;
  remainingAudioMinutes?: number;
  remainingVideoMinutes?: number;
  audioCallEligible?: boolean;
  videoCallEligible?: boolean;
  callEligibility?: 'none' | 'audio_only' | 'both';
  minAudioBalance?: number;
  minVideoBalance?: number;
}

export interface Transaction {
  transactionId: string;
  walletId?: string;
  inmateId: string;
  type: string;
  amount: number;
  currency?: string;
  status?: string;
  description?: string;
  reason?: string;
  timestamp: string;
  callId?: string;
  performedBy?: string;
  // Razorpay deposit: amount = net credited, grossAmount/fee/tax explain the
  // gateway charge (absent on manual/legacy rows).
  grossAmount?: number;
  fee?: number;
  tax?: number;
  gateway?: string;
  orderId?: string;
}

export interface Settings {
  callSettings: {
    defaultCallType?: string;
    /** Backend key used by POST /calls — the warden-controlled max call length. */
    maxCallDurationMinutes: number;
    maxDuration?: number;
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

export interface SecurityStatus {
  rfidVerification: string;
  otpVerification: string;
  browserVerification: string;
  deviceFingerprint: string;
  ipAddress: string;
  location: string;
  vpnStatus: string;
  developerMode: string;
}

/** Query string used both in the request URL and in that request's cache key. */
function buildQs(params?: object): URLSearchParams {
  const qs = new URLSearchParams();
  if (params) Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, String(v)); });
  return qs;
}

/** Cache key for a parameterised list: prefix plus the same query string. */
function listKey(prefix: string, params?: object): string {
  const qs = buildQs(params).toString();
  return qs ? `${prefix}?${qs}` : prefix;
}

/**
 * Keys for the caches the API layer writes. Views pass the matching builder to
 * `useCachedResource` so a page renders its cached answer immediately and a
 * mutation can invalidate exactly the family it changed.
 */
export const cacheKeys = {
  activeCalls: (params?: ListParams) => listKey('calls:active', params),
  callHistory: (params?: CallHistoryParams) => listKey('calls:history', params),
  call: (callId: string) => `calls:${callId}`,
  devices: (params?: ListParams) => listKey('devices:list', params),
  inmates: (params?: ListParams) => listKey('inmates:list', params),
  inmate: (inmateId: string) => `inmates:${inmateId}`,
  contacts: (params?: ListParams) => listKey('contacts:list', params),
  wallets: (params?: ListParams) => listKey('wallets:list', params),
  wallet: (inmateId: string) => `wallets:${inmateId}`,
  walletStatement: (inmateId: string) => `wallet:stmt:${inmateId}`,
  kiosks: () => 'kiosks:list',
  kioskRegistrations: (params?: ListParams) => listKey('kiosks:registration', params),
  kioskRegistrationStats: () => 'kiosks:registration:stats',
  wardens: (params?: ListParams) => listKey('wardens:list', params),
  wardenStats: () => 'wardens:stats',
  kioskAdmins: () => 'kiosk-admins',
  settings: () => 'settings',
  pricing: () => 'pricing',
  prison: (prisonId: string) => `prisons:${prisonId}`,
};

export const wardenApi = {
  // Active Calls
  getActiveCalls: (params?: ListParams) => {
    const qs = buildQs(params);
    const url = `/calls/active${qs.toString() ? '?' + qs.toString() : ''}`;
    return cachedGet(
      listKey('calls:active', params),
      () => apiClient.get<ApiResponse<PaginatedResponse<ActiveCall>>>(url).then((r) => r.data?.data ?? { items: [], total: 0, limit: 20, offset: 0 }),
      15_000,
    );
  },

  // Call by ID
  getCall: (callId: string) =>
    cachedGet(`calls:${callId}`, () => apiClient.get<ApiResponse<ActiveCall>>(`/calls/${callId}`).then((r) => r.data?.data)),

  // Call History
  getCallHistory: (params?: CallHistoryParams) => {
    const qs = buildQs(params);
    const url = `/calls/history${qs.toString() ? '?' + qs.toString() : ''}`;
    return cachedGet(
      listKey('calls:history', params),
      () => apiClient.get<ApiResponse<PaginatedCallsResponse>>(url).then((r) => r.data?.data ?? { calls: [], total: 0, limit: 20, offset: 0 }),
      30_000,
    );
  },

  // Devices
  getDevices: (params?: ListParams) => {
    const qs = buildQs(params);
    const url = `/admin/devices${qs.toString() ? '?' + qs.toString() : ''}`;
    return cachedGet(
      listKey('devices:list', params),
      () => apiClient.get<ApiResponse<PaginatedResponse<Device>>>(url).then((r) => r.data?.data ?? { items: [], total: 0, limit: 20, offset: 0 }),
      60_000,
    );
  },

  // Inmates
  getInmates: (params?: ListParams) => {
    const qs = buildQs(params);
    const url = `/inmates${qs.toString() ? '?' + qs.toString() : ''}`;
    return cachedGet(
      listKey('inmates:list', params),
      () => apiClient.get<ApiResponse<PaginatedResponse<Inmate>>>(url).then((r) => r.data?.data ?? { items: [], total: 0, limit: 20, offset: 0 }),
      60_000,
    );
  },

  getInmate: (inmateId: string) =>
    cachedGet(`inmates:${inmateId}`, () => apiClient.get<ApiResponse<Inmate>>(`/inmates/${inmateId}`).then((r) => r.data?.data)),

  getNextInmateId: () =>
    apiClient.get<ApiResponse<{ nextId: string }>>('/inmates/next-id').then((r) => r.data?.data?.nextId),

  createInmate: (data: Partial<Inmate> & {kioskId?:string}) =>
    apiClient.post<ApiResponse<Inmate>>('/inmates', data).then((r) => { invalidatePrefix('inmates'); return r.data?.data; }),

  updateInmate: (inmateId: string, data: Partial<Inmate>) =>
    apiClient.put<ApiResponse<Inmate>>(`/inmates/admin/prisoners/${inmateId}`, data).then((r) => { invalidatePrefix('inmates'); return r.data?.data; }),

  deleteInmateApi: (inmateId: string) =>
    apiClient.delete<ApiResponse<void>>(`/inmates/${inmateId}`).then((r) => { invalidatePrefix('inmates'); return r.data; }),

  // Contacts
  getContacts: (params?: ListParams) => {
    const qs = buildQs(params);
    const url = `/contacts${qs.toString() ? '?' + qs.toString() : ''}`;
    return cachedGet(
      listKey('contacts:list', params),
      () => apiClient.get<ApiResponse<PaginatedResponse<Contact>>>(url).then((r) => r.data?.data ?? { items: [], total: 0, limit: 20, offset: 0 }),
      60_000,
    );
  },

  createContact: (inmateId: string, data: Partial<Contact>) =>
    apiClient.post<ApiResponse<Contact>>(`/admin/prisoners/${inmateId}/contacts`, data).then((r) => { invalidatePrefix('contacts'); return r.data?.data; }),

  updateContact: (contactId: string, data: Partial<Contact>) =>
    apiClient.put<ApiResponse<Contact>>(`/admin/contacts/${contactId}`, data).then((r) => { invalidatePrefix('contacts'); return r.data?.data; }),

  deleteContactApi: (contactId: string) =>
    apiClient.delete<ApiResponse<void>>(`/admin/contacts/${contactId}`).then((r) => { invalidatePrefix('contacts'); return r.data; }),

  // Rotate the family wallet link and SMS it again (old token is revoked).
  resendWalletLink: (contactId: string) =>
    apiClient.post<ApiResponse<{ linkId: string; phone: string; sentAt: string }>>(`/admin/contacts/${contactId}/wallet-link/resend`).then((r) => r.data?.data),

  // Registered family devices (fingerprint registry)
  removeContactDevice: (contactId: string, fingerprintId: string) =>
    apiClient.delete<ApiResponse<{ contactId: string; fingerprintId: string }>>(`/contacts/${contactId}/devices/${fingerprintId}`)
      .then((r) => { invalidatePrefix('contacts'); return r.data?.data; }),

  clearContactDevices: (contactId: string) =>
    apiClient.delete<ApiResponse<{ removedDevices: number }>>(`/contacts/${contactId}/devices`)
      .then((r) => { invalidatePrefix('contacts'); return r.data?.data; }),

  // Wallets
  getWallets: (params?: ListParams) => {
    const qs = buildQs(params);
    const url = `/wallets${qs.toString() ? '?' + qs.toString() : ''}`;
    return cachedGet(
      listKey('wallets:list', params),
      () => apiClient.get<ApiResponse<PaginatedResponse<Wallet>>>(url).then((r) => r.data?.data ?? { items: [], total: 0, limit: 20, offset: 0 }),
      60_000,
    );
  },

  getWallet: (inmateId: string) =>
    cachedGet(`wallets:${inmateId}`, () => apiClient.get<ApiResponse<Wallet>>(`/wallets/${inmateId}`).then((r) => r.data?.data)),

  getWalletStatement: (inmateId: string) =>
    cachedGet(
      `wallet:stmt:${inmateId}`,
      () => apiClient.get<ApiResponse<{ wallet: Wallet; transactions: Transaction[] }>>(`/inmate/wallet/${inmateId}`).then((r) => r.data?.data ?? { wallet: null as any, transactions: [] }),
      30_000,
    ),

  // Settings
  getSettings: () =>
    // Some deployments return the singleton settings row as a 1-element array
    // ([{ callSettings… }]) instead of the object itself — normalize so
    // callers always see the Settings object (or undefined).
    cachedGet('settings', () => apiClient.get<ApiResponse<Settings | Settings[]>>('/settings').then((r) => {
      const d = r.data?.data;
      return (Array.isArray(d) ? (d[0] as Settings | undefined) : d) ?? undefined;
    }), 60_000),

  // Pricing (per-minute call rates set by the warden)
  getPricing: () =>
    // Same singleton-as-array quirk as getSettings — normalize.
    cachedGet('pricing', () => apiClient.get<ApiResponse<Pricing | Pricing[]>>('/pricing').then((r) => {
      const d = r.data?.data;
      return (Array.isArray(d) ? (d[0] as Pricing | undefined) : d) ?? undefined;
    }), 60_000),

  // Statistics
  getStatistics: () =>
    cachedGet('statistics', () => apiClient.get<ApiResponse<CallStatistics[]>>('/statistics').then((r) => r.data?.data ?? [])),

  // End Call (force disconnect) — immediately moves from active → call logs (completed)
  endCall: (callId: string) =>
    apiClient.post<ApiResponse<ActiveCall>>(`/calls/${callId}/end`, { endReason: 'warden_ended' }).then((r) => {
      // Bust live + history + stats caches so next fetches are fresh, not 30s stale
      invalidatePrefix('calls:active', 'calls:all', 'calls:history', `calls:${callId}`, 'statistics');
      return r.data?.data;
    }),

  // Kiosk Registration & Authorization
  getKiosks: () =>
    cachedGet('kiosks:list', () => apiClient.get<ApiResponse<KioskItem[]>>('/kiosks/').then((r) => r.data?.data ?? []), 30_000),

  getKioskRegistrationRequests: (params?: ListParams) => {
    const qs = buildQs(params);
    const url = `/kiosks/registration-requests${qs.toString() ? '?' + qs.toString() : ''}`;
    return cachedGet(
      listKey('kiosks:registration', params),
      () => apiClient.get<ApiResponse<PaginatedResponse<KioskRegistrationRequestItem>>>(url).then((r) => r.data?.data ?? { items: [], total: 0, limit: 20, offset: 0 }),
      30_000,
    );
  },

  getKioskRegistrationStats: () =>
    cachedGet(
      'kiosks:registration:stats',
      () => apiClient.get<ApiResponse<{ total: number; pendingCount: number; approvedCount: number; rejectedCount: number }>>('/kiosks/registration-requests/stats').then((r) => r.data?.data ?? { total: 0, pendingCount: 0, approvedCount: 0, rejectedCount: 0 }),
      30_000,
    ),

  approveKioskRegistration: (requestId: string) =>
    apiClient.patch<ApiResponse<{ success: boolean }>>(`/kiosks/registration/${requestId}/approve`).then((r) => {
      invalidatePrefix('kiosks:registration');
      // The approved device shows up on the Kiosks tab immediately.
      invalidatePrefix('kiosks:list');
      return r.data?.data ?? { success: false };
    }),

  rejectKioskRegistration: (requestId: string, reason?: string) =>
    apiClient.patch<ApiResponse<{ success: boolean }>>(`/kiosks/registration/${requestId}/reject`, { reason }).then((r) => {
      invalidatePrefix('kiosks:registration');
      invalidatePrefix('kiosks:list');
      return r.data?.data ?? { success: false };
    }),

  // Warden-facing activate/deactivate. 'active' enables the device again
  // (heartbeat decides online/offline); 'disabled' deactivates it — the
  // backend refuses device logins while a kiosk's stored status is 'disabled'.
  setKioskStatus: (kioskId: string, status: 'active' | 'disabled') =>
    apiClient.patch<ApiResponse<KioskItem>>(`/kiosks/${encodeURIComponent(kioskId)}`, { status }).then((r) => {
      invalidatePrefix('kiosks:list');
      return r.data?.data ?? null;
    }),

  getKioskStats: (kioskId: string) =>
    apiClient.get<ApiResponse<KioskStats>>(`/kiosks/${encodeURIComponent(kioskId)}/stats`).then((r) => r.data?.data),

  getSetupPassword: (prisonId: string) =>
    cachedGet(`kiosks:password:${prisonId}`, () => apiClient.get<ApiResponse<SetupPasswordData>>(`/kiosks/setup-password/${prisonId}`).then((r) => r.data?.data)),

  updateSetupPassword: (prisonId: string, password: string) =>
    apiClient.put<ApiResponse<{ success: boolean }>>('/kiosks/setup-password', { prisonId, password }).then((r) => {
      invalidatePrefix(`kiosks:password:${prisonId}`);
      return r.data?.data ?? { success: false };
    }),

  // User Management
  getWardens: (params?: ListParams) => {
    const qs = buildQs(params);
    const url = `/wardens${qs.toString() ? '?' + qs.toString() : ''}`;
    return cachedGet(
      listKey('wardens:list', params),
      () => apiClient.get<ApiResponse<PaginatedResponse<any>>>(url).then((r) => r.data?.data ?? { items: [], total: 0, limit: 20, offset: 0 }),
      60_000,
    );
  },

  getWardenStats: () =>
    cachedGet(
      'wardens:stats',
      () => apiClient.get<ApiResponse<{ total: number; activeCount: number; inactiveCount: number; onLeaveCount: number; canManageWardens?: boolean }>>('/wardens/stats').then((r) => r.data?.data ?? { total: 0, activeCount: 0, inactiveCount: 0, onLeaveCount: 0, canManageWardens: false }),
      60_000,
    ),

  createWarden: (payload: NewWardenInput) =>
    apiClient.post<ApiResponse<WardenRecord>>('/wardens', payload).then((r) => {
      invalidatePrefix('wardens');
      return r.data?.data;
    }),

  updateWarden: (wardenId: string, patch: WardenUpdate) =>
    apiClient
      .patch<ApiResponse<WardenRecord>>(`/wardens/${encodeURIComponent(wardenId)}`, patch)
      .then((r) => {
        invalidatePrefix('wardens');
        return r.data?.data;
      }),

  deleteWarden: (wardenId: string) =>
    apiClient
      .delete<ApiResponse<{ message: string; wardenId: string }>>(`/wardens/${encodeURIComponent(wardenId)}`)
      .then((r) => {
        invalidatePrefix('wardens');
        return r.data?.data;
      }),

  getKioskAdmins: () =>
    cachedGet('kiosk-admins', () => apiClient.get<ApiResponse<KioskAdmin[]>>('/kiosk-admins').then((r) => r.data?.data ?? []), 60_000),

  createKioskAdmin: (payload: NewKioskAdminInput) =>
    apiClient.post<ApiResponse<KioskAdmin>>('/kiosk-admins', payload).then((r) => {
      invalidatePrefix('kiosk-admins');
      return r.data?.data;
    }),

  updateKioskAdmin: (adminId: string, patch: KioskAdminUpdate) =>
    apiClient
      .patch<ApiResponse<KioskAdmin>>(`/kiosk-admins/${encodeURIComponent(adminId)}`, patch)
      .then((r) => {
        invalidatePrefix('kiosk-admins');
        return r.data?.data;
      }),

  deleteKioskAdmin: (adminId: string) =>
    apiClient
      .delete<ApiResponse<{ message: string; adminId: string }>>(`/kiosk-admins/${encodeURIComponent(adminId)}`)
      .then((r) => {
        invalidatePrefix('kiosk-admins');
        return r.data?.data;
      }),

  // Prisons
  getPrison: (prisonId: string) =>
    cachedGet(`prisons:${prisonId}`, () => apiClient.get<ApiResponse<PrisonInfo>>(`/prisons/${encodeURIComponent(prisonId)}`).then((r) => r.data?.data)),

  /** Facility profile edits (warden: name/code/state/district/address only — server-enforced). */
  updatePrison: (prisonId: string, patch: Partial<PrisonInfo>) =>
    apiClient.patch<ApiResponse<PrisonInfo>>(`/prisons/${encodeURIComponent(prisonId)}`, patch).then((r) => {
      invalidatePrefix('prisons');
      return r.data?.data;
    }),

  // Toggle inmate active/inactive
  toggleInmate: (inmateId: string) =>
    apiClient.patch<ApiResponse<any>>(`/inmates/admin/prisoners/${inmateId}/toggle`).then((r) => r.data?.data),

  // Toggle contact active/inactive
  toggleContact: (contactId: string) =>
    apiClient.patch<ApiResponse<any>>(`/contacts/admin/contacts/${contactId}/toggle`).then((r) => r.data?.data),

  // Reset inmate PIN
  resetInmatePin: (inmateId: string, pin: string) =>
    apiClient.post<ApiResponse<any>>(`/admin/prisoners/${inmateId}/reset-pin`, { pin }).then((r) => r.data?.data),

  // Biometrics
  getInmateBiometrics: (inmateId: string) =>
    apiClient.get<ApiResponse<any[]>>(`/admin/prisoners/${inmateId}/biometrics`).then((r) => r.data?.data ?? []),

  deleteBiometric: (biometricId: string, prisonerId: string) =>
    apiClient.delete<ApiResponse<any>>(`/admin/biometrics/${biometricId}`, { params: { prisonerId } }).then((r) => r.data?.data),
};

export interface KioskItem {
  kioskId: string;
  uid?: number;
  prisonId: string;
  prisonName?: string;
  deviceSerialNumber?: string;
  deviceFingerprint?: string;
  status?: string;
  authorizationStatus?: string;
  location?: string;
  ipAddress?: string;
  androidVersion?: string;
  firmwareVersion?: string;
  appVersion?: string;
  lastSeen?: string;
  lastHeartbeatAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  hardware?: Record<string, unknown>;
  camera?: Record<string, unknown>;
  microphone?: Record<string, unknown>;
  speaker?: Record<string, unknown>;
  printer?: Record<string, unknown>;
  network?: Record<string, unknown>;
  registeredInmates?: number;
}

export interface KioskPeriodStats {
  total: number;
  audio: number;
  video: number;
  minutes: number;
}

export interface KioskRecentCall {
  callId: string;
  startTime: string | null;
  type: string;
  status: string;
  minutes: number;
  inmateName: string | null;
  familyMemberName: string | null;
}

export interface KioskStats {
  kioskId: string;
  prisonId: string | null;
  prisonName: string | null;
  deviceSerialNumber: string | null;
  location: string | null;
  ipAddress: string | null;
  androidVersion: string | null;
  status: string;
  authorizationStatus: string;
  lastSeen: string | null;
  lastHeartbeatAt: string | null;
  installationDate: string | null;
  registeredInmates: number;
  today: KioskPeriodStats;
  month: KioskPeriodStats;
  allTime: KioskPeriodStats;
  lastCallAt: string | null;
  recentCalls: KioskRecentCall[];
}

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
  rejectionReason?: string | null;
}

export interface SetupPasswordData {
  prisonId: string;
  passwordSet: boolean;
  updatedAt?: string | null;
}

/** Facility profile as returned by GET /prisons/:prisonId. */
export interface PrisonInfo {
  prisonId: string;
  name: string;
  state?: string;
  district?: string;
  address?: string;
  status?: string;
  currentInmateCount?: number;
  wardenIds?: string[];
  kioskIds?: string[];
  createdAt?: string;
}