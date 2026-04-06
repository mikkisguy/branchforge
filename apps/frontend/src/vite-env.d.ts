/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ENV?: string;
  readonly VITE_FRONTEND_BASE_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_BACKEND_API_URL?: string;
  readonly VITE_ALLOWED_HOSTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
