export const env = {
  apiGatewayUrl: import.meta.env.VITE_API_GATEWAY_URL || 'https://prisonconnect-mockbackend.onrender.com',
  signalingUrl: import.meta.env.VITE_SIGNALING_URL || 'https://prisonconnect-mockbackend.onrender.com',
  defaultUsername: import.meta.env.VITE_DEFAULT_USERNAME || 'admin',
  defaultPassword: import.meta.env.VITE_DEFAULT_PASSWORD || 'admin',
} as const;
