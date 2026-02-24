/**
 * Firebase Configuration — SchoolIT AI
 * =====================================
 * Optional cloud storage backend for conversation history.
 * Falls back to localStorage when Firebase is not configured.
 *
 * Setup:
 * 1. Create a Firebase project at https://console.firebase.google.com/
 * 2. Enable Cloud Firestore (in test mode for development)
 * 3. Add these environment variables to your Vercel project:
 *    - NEXT_PUBLIC_FIREBASE_API_KEY
 *    - NEXT_PUBLIC_FIREBASE_PROJECT_ID
 * 4. Redeploy — cloud sync will activate automatically
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ""}.firebaseapp.com`,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ""}.firebasestorage.app`,
};

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;

// Only initialize in browser and when credentials are provided
if (
  typeof window !== "undefined" &&
  firebaseConfig.apiKey &&
  firebaseConfig.projectId
) {
  try {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }
    firestore = getFirestore(app);
  } catch (err) {
    console.warn("Firebase initialization failed:", err);
    app = null;
    firestore = null;
  }
}

export const db = firestore;
export function isFirebaseEnabled(): boolean {
  return !!firestore;
}
