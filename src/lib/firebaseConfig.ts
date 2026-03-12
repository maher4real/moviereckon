export const FIREBASE_WEB_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCF_Kas30rBPX3X2K7llW_kdzccKdc4yV8",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "moviereckon-21f88.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "moviereckon-21f88",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "moviereckon-21f88.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "685371691987",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:685371691987:web:86cc6f0ca6fb43ff7a1526",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-FKGRLHT1EC",
} as const;

export function isFirebaseEmailVerificationConfigured(): boolean {
  return Boolean(
    FIREBASE_WEB_CONFIG.apiKey
      && FIREBASE_WEB_CONFIG.authDomain
      && FIREBASE_WEB_CONFIG.projectId
      && FIREBASE_WEB_CONFIG.appId,
  );
}
