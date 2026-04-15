// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

// --- PASTE YOUR CONFIG FROM FIREBASE CONSOLE BELOW ---
const firebaseConfig = {
    apiKey: "AIzaSyDMoFj2uZOe5rrEXdDl8NwSI13OWmoDBuw",
    authDomain: "app.proadsai.com",
    projectId: "proadsai-saas",
    storageBucket: "proadsai-saas.firebasestorage.app",
    messagingSenderId: "544195266497",
    appId: "1:544195266497:web:d8fbbbf397ffed96135140"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services
export const auth = getAuth(app);
export const db = getFirestore(app);
// MUST match the region we deployed to (europe-west1)
export const functions = getFunctions(app, "europe-west1");
export const storage = getStorage(app);