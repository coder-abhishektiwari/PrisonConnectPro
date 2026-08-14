/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_GATEWAY_URL: string;
  readonly VITE_SIGNALING_URL: string;
  readonly VITE_MEDIASOUP_MONITOR_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
