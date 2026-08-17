/**
 * Centralized environment configuration.
 * All environment variables are accessed through this module.
 */
export const env = {
  apiGatewayUrl: import.meta.env.VITE_API_GATEWAY_URL,
  signalingUrl: import.meta.env.VITE_SIGNALING_URL,
  webrtcIceServers: import.meta.env.VITE_WEBRTC_ICE_SERVERS,
} as const;

if (!env.apiGatewayUrl) {
  throw new Error('VITE_API_GATEWAY_URL is not set - the family-web build requires the public backend URL (no localhost defaults)');
}
if (!env.signalingUrl) {
  throw new Error('VITE_SIGNALING_URL is not set - the family-web build requires the public signaling URL (no localhost defaults)');
}