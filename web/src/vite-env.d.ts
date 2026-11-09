/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Address of the API in production; empty in development (Vite proxy). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
