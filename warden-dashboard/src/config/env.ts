/**
 * Centralized environment configuration.
 * All environment variables are accessed through this module.
 */
export const env = {
  apiGatewayUrl: import.meta.env.VITE_API_GATEWAY_URL || 'https://prisonconnect-backend-q71g.onrender.com',
  signalingUrl: import.meta.env.VITE_SIGNALING_URL,
} as const;