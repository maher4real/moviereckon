function getPublicFirebaseEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export const FIREBASE_WEB_CONFIG = {
  apiKey: getPublicFirebaseEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: getPublicFirebaseEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: getPublicFirebaseEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: getPublicFirebaseEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getPublicFirebaseEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getPublicFirebaseEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
  measurementId: getPublicFirebaseEnv("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"),
} as const;

export function isFirebaseEmailVerificationConfigured(): boolean {
  return Boolean(
    FIREBASE_WEB_CONFIG.apiKey
      && FIREBASE_WEB_CONFIG.authDomain
      && FIREBASE_WEB_CONFIG.projectId
      && FIREBASE_WEB_CONFIG.appId,
  );
}
