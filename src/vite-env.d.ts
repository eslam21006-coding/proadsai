/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Gemini API key has been moved server-side — no client env vars needed
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}