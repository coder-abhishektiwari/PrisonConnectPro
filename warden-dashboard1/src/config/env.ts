/**
 * Centralized environment configuration.
 * All environment variables are accessed through this module.
 */
export const env = {
  apiGatewayUrl: import.meta.env.VITE_API_GATEWAY_URL,
  signalingUrl: import.meta.env.VITE_SIGNALING_URL,
} as const;