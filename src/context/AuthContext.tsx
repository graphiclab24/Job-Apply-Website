import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../services/firebase';
import { setDriveAccessToken } from '../services/googleDrive';
import { WORKER_URL } from '../services/jobsStore';
import { mobileToEmail, emailToMobile, isValidMobile, isValidPassword } from '../utils/auth';
import { UserRole } from '../types';

// Standard Google Auth Provider for regular user sign-in:
// Pure authentication ONLY (email, profile). ZERO Google Drive scopes to eliminate "Contact developer" / "App unverified" blocks!
const cleanUserGoogleProvider = new GoogleAuthProvider();
cleanUserGoogleProvider.setCustomParameters({ prompt: 'select_account' });

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
 * নতুন অ্যাডমিন যোগ করলে এখানে এবং firestore.rules-এ দুই জায়গাতেই যোগ করতে হবে।
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
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [role, setRole] = useState<UserRole | null>(() => getStoredRole());
  const [mobile, setMobile] = useState<string | null>(() => getStoredMobile());
  // IMPORTANT: loading must be TRUE until onAuthStateChanged resolves from Firebase SDK
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  // পেজ খোলার সময় কোনো Firestore read নেই।
  // অ্যাডমিন = ইমেইল তালিকা; বাকিরা = ইউজার, মোবাইল ইমেইল থেকে বের হয়।
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        if (isOwnerEmail(currentUser.email)) {
          setRole('admin');
          setMobile(null);
          persistRole('admin');
          persistMobile(null);
        } else {
          // আগে লগইনের সময় যিনি অ্যাডমিন হিসেবে যাচাই হয়েছিলেন, তার role বজায় থাকে
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

    return () => unsubscribe();
  }, []);

  /**
   * মাস্টার লগইন: মোবাইল নম্বর + মাস্টার পাসওয়ার্ড দিলে Worker ওই ব্যবহারকারীর
   * কাস্টম টোকেন দেয়। সেটি দিয়ে সেই ব্যবহারকারী হিসেবে সাইন-ইন হয়।
   * মাস্টার পাসওয়ার্ড শুধু Worker-এর Secret-এ থাকে, এখানে কোনো গোপন মান নেই।
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
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      const wrongCredential =
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found';

      // মোবাইল লগইন ব্যর্থ হলে মাস্টার পাসওয়ার্ড হিসেবে চেষ্টা (ইমেইল লগইনে নয়)
      if (wrongCredential && !isEmailLogin) {
        const ok = await tryMasterLogin(cleanId, pass);
        if (ok) return;
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
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const userRef = doc(db, 'users', cred.user.uid);
      try {
        await setDoc(userRef, {
          mobile: userMobile,
          email: email,
          role: 'user',
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${cred.user.uid}`);
      }
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
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      } catch (signInErr: any) {
        // তালিকার অ্যাডমিনের প্রথম লগইনে অ্যাকাউন্ট না থাকলে তৈরি করা হবে
        if (
          isOwner &&
          (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential')
        ) {
          try {
            cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
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
        // তালিকার অ্যাডমিন: কোনো Firestore read নয়
        setRole('admin');
        persistRole('admin');
        persistMobile(null);
        return;
      }

      // তালিকার বাইরের ইমেইল: শুধু লগইনের সময় admins collection যাচাই (একবার)
      const adminDoc = await getDoc(doc(db, 'admins', cred.user.uid));
      if (!adminDoc.exists()) {
        await signOut(auth);
        throw new Error('আপনি অ্যাডমিন নন। প্রবেশাধিকার সংরক্ষিত।');
      }

      setRole('admin');
      persistRole('admin');
      persistMobile(null);
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
      // Clean standard Google Auth Provider (ZERO Drive scopes = instant login, no developer verification warning)
      const result = await signInWithPopup(auth, cleanUserGoogleProvider);

      if (isOwnerEmail(result.user.email)) {
        setRole('admin');
        persistRole('admin');
        return;
      }

      // তালিকার বাইরের অ্যাডমিন হলে (লগইনের সময় একবার যাচাই)
      const adminDoc = await getDoc(doc(db, 'admins', result.user.uid));
      if (adminDoc.exists()) {
        setRole('admin');
        persistRole('admin');
        return;
      }

      // সাধারণ ইউজার: প্রোফাইল একবার লিখে দেওয়া (merge, পড়া ছাড়া)
      try {
        await setDoc(
          doc(db, 'users', result.user.uid),
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
    await signOut(auth);
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
