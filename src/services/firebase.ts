import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
} from 'firebase/firestore';
import defaultAppletConfig from '../../firebase-applet-config.json';

// Support both Vite browser (import.meta.env) and Node.js server (process.env)
const getEnvVar = (key: string) => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.[key]) {
      return (import.meta as any).env[key];
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env?.[key]) {
      return process.env[key];
    }
  } catch {}
  return undefined;
};

const firebaseConfig = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY') || defaultAppletConfig.apiKey,
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN') || defaultAppletConfig.authDomain,
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID') || defaultAppletConfig.projectId,
  messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID') || defaultAppletConfig.messagingSenderId,
  appId: getEnvVar('VITE_FIREBASE_APP_ID') || defaultAppletConfig.appId,
  firestoreDatabaseId: getEnvVar('VITE_FIREBASE_DATABASE_ID') || (defaultAppletConfig as any).firestoreDatabaseId,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const databaseId =
  getEnvVar('VITE_FIREBASE_DATABASE_ID') ||
  (defaultAppletConfig as any).firestoreDatabaseId;

// Safely determine whether IndexedDB and LocalStorage are truly supported in current runtime
const canUsePersistentCache = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (!window.localStorage || !window.indexedDB) return false;
    const testKey = '__fb_storage_check__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

const getCacheSettings = () => {
  if (canUsePersistentCache()) {
    try {
      return {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        experimentalAutoDetectLongPolling: true,
      };
    } catch {
      return {
        localCache: memoryLocalCache(),
        experimentalAutoDetectLongPolling: true,
      };
    }
  }
  return {
    localCache: memoryLocalCache(),
    experimentalAutoDetectLongPolling: true,
  };
};

let firestoreInstance;
try {
  const cacheSettings = getCacheSettings();
  firestoreInstance = databaseId
    ? initializeFirestore(app, cacheSettings, databaseId)
    : initializeFirestore(app, cacheSettings);
} catch {
  // If already initialized or fallback needed
  try {
    firestoreInstance = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  } catch {
    firestoreInstance = databaseId
      ? initializeFirestore(app, { localCache: memoryLocalCache(), experimentalAutoDetectLongPolling: true }, databaseId)
      : initializeFirestore(app, { localCache: memoryLocalCache(), experimentalAutoDetectLongPolling: true });
  }
}

export const db = firestoreInstance;
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Operation Notice: ', JSON.stringify(errInfo));
  throw new Error(errInfo.error);
}
