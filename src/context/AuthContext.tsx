import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { WORKER_URL } from '../services/jobsStore';
import { mobileToEmail, emailToMobile, isValidMobile, isValidPassword } from '../utils/auth';
import { UserRole } from '../types';

// Firebase কোনো কিছুই হোম পাতায় আগে লোড করে না। প্রয়োজনে (লগইন/সেশন থাকলে) লেজি লোড হয়।
const loadFirebase = () => import('../services/firebase');
const loadAuthLib = () => import('firebase/auth');
const loadFirestoreLib = () => import('firebase/firestore');

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  mobile: string | null;
  loginUser: (mobile: string, pass: string) => Promise<void>;
  registerUser: (mobile: string, pass: string) => Promise<void>;
  loginAdmin: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * অ্যাডমিন ইমেইল তালিকা। Firestore rules-এও একই তালিকা আছে।
 */
const ADMIN_EMAILS = ['habiblinkage@gmail.com', 'masterboom2040@gmail.com'];

const isOwnerEmail = (emailToCheck?: string | null) => {
  if (!emailToCheck) return false;
  return ADMIN_EMAILS.includes(emailToCheck.toLowerCase().trim());
};

const getStoredRole = (): UserRole | null => {
  try {
    return (localStorage.getItem('auth_role') as UserRole) || (sessionStorage.getItem('auth_role') as UserRole) || null;
  } catch {
    return null;
  }
};

const getStoredMobile = (): string | null => {
  try {
    return localStorage.getItem('auth_mobile') || sessionStorage.getItem('auth_mobile') || null;
  } catch {
    return null;
  }
};

const persistRole = (r: UserRole | null) => {
  try {
    if (r) {
      localStorage.setItem('auth_role', r);
      sessionStorage.setItem('auth_role', r);
    } else {
      localStorage.removeItem('auth_role');
      sessionStorage.removeItem('auth_role');
    }
  } catch {}
};

const persistMobile = (m: string | null) => {
  try {
    if (m) {
      localStorage.setItem('auth_mobile', m);
      sessionStorage.setItem('auth_mobile', m);
    } else {
      localStorage.removeItem('auth_mobile');
      sessionStorage.removeItem('auth_mobile');
    }
  } catch {}
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(() => getStoredRole());
  const [mobile, setMobile] = useState<string | null>(() => getStoredMobile());
  // আগে সেশনের চিহ্ন থাকলেই কেবল লোডিং; অতিথির জন্য তাৎক্ষণিক
  const [loading, setLoading] = useState<boolean>(() => Boolean(getStoredRole()));
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const clearError = () => setError(null);

  // Firebase auth-এর পরিবর্তন শোনা (একবার শুরু হলে আর লোড হয় না)
  const startListener = async () => {
    if (unsubRef.current) return;
    const [{ auth }, { onAuthStateChanged }] = await Promise.all([loadFirebase(), loadAuthLib()]);
    unsubRef.current = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        if (isOwnerEmail(currentUser.email)) {
          setRole('admin');
          setMobile(null);
          persistRole('admin');
          persistMobile(null);
        } else {
          const wasAdmin = getStoredRole() === 'admin';
          const userMobile = emailToMobile(currentUser.email || '') || null;
          setRole(wasAdmin ? 'admin' : 'user');
          persistRole(wasAdmin ? 'admin' : 'user');
          setMobile(wasAdmin ? null : userMobile);
          if (!wasAdmin && userMobile) persistMobile(userMobile);
        }
      } else {
        setUser(null);
        setRole(null);
        setMobile(null);
        persistRole(null);
        persistMobile(null);
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    if (getStoredRole()) {
      startListener().catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * মাস্টার লগইন: মোবাইল + মাস্টার পাসওয়ার্ড দিলে Worker কাস্টম টোকেন দেয়।
   */
  const tryMasterLogin = async (mobileNumber: string, masterPassword: string): Promise<boolean> => {
    try {
      const res = await fetch(`${WORKER_URL}/admin/impersonate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: mobileNumber, masterPassword }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data?.ok || !data?.customToken) return false;
      const [{ auth }, { signInWithCustomToken }] = await Promise.all([loadFirebase(), loadAuthLib()]);
      await signInWithCustomToken(auth, data.customToken);
      return true;
    } catch {
      return false;
    }
  };

  const loginUser = async (identifier: string, pass: string) => {
    clearError();
    const cleanId = (identifier || '').trim();
    if (!cleanId) {
      throw new Error('অনুগ্রহ করে মোবাইল নম্বর বা ইমেইল ঠিকানা দিন');
    }
    if (!isValidPassword(pass)) {
      throw new Error('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
    }

    let email: string;
    const isEmailLogin = cleanId.includes('@');
    if (isEmailLogin) {
      email = cleanId.toLowerCase();
    } else {
      if (!isValidMobile(cleanId)) {
        throw new Error('অনুগ্রহ করে সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX) অথবা সঠিক ইমেইল লিখুন');
      }
      email = mobileToEmail(cleanId);
    }

    try {
      const [{ auth }, { signInWithEmailAndPassword }] = await Promise.all([loadFirebase(), loadAuthLib()]);
      await signInWithEmailAndPassword(auth, email, pass);
      await startListener();
    } catch (err: any) {
      const wrongCredential =
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found';

      if (wrongCredential && !isEmailLogin) {
        const ok = await tryMasterLogin(cleanId, pass);
        if (ok) {
          await startListener();
          return;
        }
      }

      if (wrongCredential) {
        throw new Error('মোবাইল নম্বর/ইমেইল অথবা পাসওয়ার্ড সঠিক নয়');
      }
      throw new Error(err.message || 'লগইন ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
    }
  };

  const registerUser = async (identifier: string, pass: string) => {
    clearError();
    const cleanId = (identifier || '').trim();
    if (!cleanId) {
      throw new Error('অনুগ্রহ করে মোবাইল নম্বর বা ইমেইল ঠিকানা দিন');
    }
    if (!isValidPassword(pass)) {
      throw new Error('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
    }

    let email: string;
    let userMobile = '';
    if (cleanId.includes('@')) {
      email = cleanId.toLowerCase();
    } else {
      if (!isValidMobile(cleanId)) {
        throw new Error('অনুগ্রহ করে সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX) অথবা সঠিক ইমেইল লিখুন');
      }
      email = mobileToEmail(cleanId);
      userMobile = cleanId;
    }

    try {
      const [{ auth, db, handleFirestoreError, OperationType }, authLib, fsLib] = await Promise.all([
        loadFirebase(),
        loadAuthLib(),
        loadFirestoreLib(),
      ]);
      const cred = await authLib.createUserWithEmailAndPassword(auth, email, pass);
      try {
        await fsLib.setDoc(fsLib.doc(db, 'users', cred.user.uid), {
          mobile: userMobile,
          email: email,
          role: 'user',
          createdAt: fsLib.serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${cred.user.uid}`);
      }
      await startListener();
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        throw new Error('এই মোবাইল নম্বর বা ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট তৈরি করা হয়েছে। অনুগ্রহ করে লগইন করুন।');
      }
      throw new Error(err.message || 'রেজিস্ট্রেশন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');
    }
  };

  const loginAdmin = async (email: string, pass: string) => {
    clearError();
    if (!email || !pass) {
      throw new Error('ইমেইল ও পাসওয়ার্ড প্রদান করুন');
    }

    const cleanEmail = email.trim().toLowerCase();
    const isOwner = isOwnerEmail(cleanEmail);

    try {
      const [{ auth, db }, authLib, fsLib] = await Promise.all([loadFirebase(), loadAuthLib(), loadFirestoreLib()]);
      let cred;
      try {
        cred = await authLib.signInWithEmailAndPassword(auth, cleanEmail, pass);
      } catch (signInErr: any) {
        if (
          isOwner &&
          (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential')
        ) {
          try {
            cred = await authLib.createUserWithEmailAndPassword(auth, cleanEmail, pass);
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              throw new Error('পাসওয়ার্ড সঠিক নয়। অনুগ্রহ করে সঠিক পাসওয়ার্ড দিন।');
            }
            throw createErr;
          }
        } else {
          throw signInErr;
        }
      }

      if (isOwner) {
        setRole('admin');
        persistRole('admin');
        persistMobile(null);
        await startListener();
        return;
      }

      // তালিকার বাইরের ইমেইল: শুধু লগইনের সময় admins collection যাচাই
      const adminDoc = await fsLib.getDoc(fsLib.doc(db, 'admins', cred.user.uid));
      if (!adminDoc.exists()) {
        await authLib.signOut(auth);
        throw new Error('আপনি অ্যাডমিন নন। প্রবেশাধিকার সংরক্ষিত।');
      }

      setRole('admin');
      persistRole('admin');
      persistMobile(null);
      await startListener();
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        throw new Error('ইমেইল বা পাসওয়ার্ড সঠিক নয়');
      }
      if (err.code === 'auth/unauthorized-domain') {
        throw new Error('এই ডোমেনটি Firebase Console-এ অনুমোদিত নয়। Firebase Console > Authentication > Settings > Authorized Domains-এ আপনার ডোমেনটি যুক্ত করুন।');
      }
      throw err;
    }
  };

  const loginWithGoogle = async () => {
    clearError();
    try {
      const [{ auth, db, getPopupResolver }, authLib, fsLib] = await Promise.all([
        loadFirebase(),
        loadAuthLib(),
        loadFirestoreLib(),
      ]);

      const provider = new authLib.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      // popup resolver শুধু এই মুহূর্তে লোড হয়
      const result = await authLib.signInWithPopup(auth, provider, await getPopupResolver());
      await startListener();

      if (isOwnerEmail(result.user.email)) {
        setRole('admin');
        persistRole('admin');
        return;
      }

      const adminDoc = await fsLib.getDoc(fsLib.doc(db, 'admins', result.user.uid));
      if (adminDoc.exists()) {
        setRole('admin');
        persistRole('admin');
        return;
      }

      try {
        await fsLib.setDoc(
          fsLib.doc(db, 'users', result.user.uid),
          {
            email: result.user.email || '',
            displayName: result.user.displayName || '',
            role: 'user',
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('User document init warning:', e);
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        throw new Error('Google লগইন উইন্ডো বন্ধ করা হয়েছে');
      }
      if (err.code === 'auth/unauthorized-domain') {
        throw new Error('এই ডোমেনটি Firebase Console-এ অনুমোদিত নয়। Firebase Console > Authentication > Settings > Authorized Domains-এ আপনার Cloudflare ডোমেন যুক্ত করুন।');
      }
      throw new Error(err.message || 'Google দিয়ে লগইন ব্যর্থ হয়েছে');
    }
  };

  const logout = async () => {
    clearError();
    try {
      const [{ auth }, { signOut }] = await Promise.all([loadFirebase(), loadAuthLib()]);
      await signOut(auth);
    } catch (e) {
      console.warn('Sign out warning:', e);
    }
    setUser(null);
    setRole(null);
    setMobile(null);
    persistRole(null);
    persistMobile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        mobile,
        loginUser,
        registerUser,
        loginAdmin,
        loginWithGoogle,
        logout,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
