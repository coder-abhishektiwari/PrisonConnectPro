/**
 * Centralized environment configuration.
 * All environment variables are accessed through this module.
 */
export const env = {
  apiGatewayUrl: 'https://prisonconnect-mockbackend.onrender.com',
  signalingUrl: import.meta.env.VITE_SIGNALING_URL || 'https://prisonconnect-mockbackend.onrender.com',
  mediasoupMonitorUrl: import.meta.env.VITE_MEDIASOUP_MONITOR_URL || 'https://prisonconnect-mockbackend.onrender.com',
} as const;