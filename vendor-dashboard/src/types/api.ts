export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: number;
}

export interface ApiError {
  success: boolean;
  error: {
    code: string;
    message: string;
  };
  timestamp: number;
}

export interface Prison {
  id: string;
  name: string;
  code: string;
  state: string;
  district: string;
  status: 'online' | 'offline';
  totalKiosks: number;
  activeKiosks: number;
  totalInmates: number;
  activeCalls: number;
  revenueToday: number;
  revenueMonthly: number;
}

export interface ServerHealth {
  id: string;
  name: string;
  status: 'online' | 'offline';
  cpu: number;
  ram: number;
  storage: number;
  uptime: string;
}

export interface Subscription {
  id: string;
  prisonId: string;
  customer: string;
  plan: string;
  expiry: string;
  license: string;
  renewalDate: string;
  status: string;
}

export interface Pricing {
  audio: { price: number; unit: string };
  video: { price: number; unit: string };
  tax: number;
  gst: string;
  billingRules: string[];
}

export interface StorageStats {
  total: number;
  used: number;
  available: number;
  retention: string;
  encryption: string;
}
