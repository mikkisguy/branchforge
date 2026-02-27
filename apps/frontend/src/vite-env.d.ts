/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ENV: string;
  // Add other VITE_ prefixed env variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
