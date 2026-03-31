// src/google-genai.d.ts
// Minimal type declarations for @google/genai
// This file ensures TypeScript doesn't error on the import even if 
// the package's own types aren't resolving correctly.

declare module '@google/genai' {
    export class GoogleGenAI {
        constructor(options: { apiKey: string });
        models: {
            generateContent(params: any): Promise<any>;
        };
    }

    export const Type: {
        STRING: string;
        OBJECT: string;
        ARRAY: string;
        BOOLEAN: string;
        NUMBER: string;
    };

    export const HarmCategory: {
        HARM_CATEGORY_HARASSMENT: string;
        HARM_CATEGORY_HATE_SPEECH: string;
        HARM_CATEGORY_SEXUALLY_EXPLICIT: string;
        HARM_CATEGORY_DANGEROUS_CONTENT: string;
    };

    export const HarmBlockThreshold: {
        BLOCK_ONLY_HIGH: string;
        BLOCK_MEDIUM_AND_ABOVE: string;
        BLOCK_LOW_AND_ABOVE: string;
        BLOCK_NONE: string;
    };
}