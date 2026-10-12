import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../services/firebase';
import { setDriveAccessToken } from '../services/googleDrive';
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

const isOwnerEmail = (emailToCheck?: string | null) => {
  if (!emailToCheck) return false;
  const em = emailToCheck.toLowerCase().trim();
  return (
    em === 'habiblinkage@gmail.com' ||
    em === 'masterboom2040@gmail.com' ||
    em === 'admin@studyonlinebd.com'
  );
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const isOwner = isOwnerEmail(currentUser.email);
          if (isOwner) {
            setRole('admin');
            setMobile(null);
            persistRole('admin');
            persistMobile(null);
            setLoading(false);

            // Background admin doc touch if needed
            const adminDocRef = doc(db, 'admins', currentUser.uid);
            getDoc(adminDocRef).then((snap) => {
              if (!snap.exists()) {
                setDoc(adminDocRef, {
                  email: currentUser.email,
                  role: 'admin',
                  createdAt: serverTimestamp(),
                }).catch(() => {});
              }
            }).catch(() => {});
            return;
          }

          const adminDocRef = doc(db, 'admins', currentUser.uid);
          const adminDoc = await getDoc(adminDocRef);

          if (adminDoc.exists()) {
            setRole('admin');
            setMobile(null);
            persistRole('admin');
            persistMobile(null);
          } else {
            // Check if regular user
            const userDocRef = doc(db, 'users', currentUser.uid);
            const userDoc = await getDoc(userDocRef);
            const userMobile = userDoc.exists()
              ? userDoc.data()?.mobile || emailToMobile(currentUser.email || '')
              : emailToMobile(currentUser.email || '');

            setRole('user');
            setMobile(userMobile);
            persistRole('user');
            if (userMobile) persistMobile(userMobile);
          }
        } catch (err) {
          // Handled silently
          setRole('user');
          persistRole('user');
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
    if (cleanId.includes('@')) {
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
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
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
        throw new Error('এই মোবাইল নম্বর বা ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট তৈরি করা হয়েছে। অনুগ্রহ করে লগইন করুন।');
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
        // Modern Firebase Auth returns 'auth/invalid-credential' instead of 'user-not-found' due to email enumeration protection
        if (
          isOwner &&
          (signInErr.code === 'auth/user-not-found' ||
           signInErr.code === 'auth/invalid-credential')
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

      // If owner, grant admin role immediately without blocking on Firestore network call
      if (isOwner) {
        setRole('admin');
        try {
          sessionStorage.setItem('auth_role', 'admin');
        } catch {}

        // Touch admin doc in background without blocking login
        try {
          const adminDocRef = doc(db, 'admins', cred.user.uid);
          setDoc(
            adminDocRef,
            {
              email: cred.user.email,
              role: 'admin',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          ).catch((e) => console.warn('Background admin doc sync:', e));
        } catch (e) {
          // Ignore
        }
        return;
      }

      // For non-owner admin verification
      try {
        const adminDocRef = doc(db, 'admins', cred.user.uid);
        const adminDoc = await getDoc(adminDocRef);

        if (!adminDoc.exists()) {
          await signOut(auth);
          throw new Error('আপনি অ্যাডমিন নন। প্রবেশাধিকার সংরক্ষিত।');
        }
      } catch (checkErr: any) {
        if (checkErr.message?.includes('offline')) {
          console.warn('Firestore offline notice during admin check');
        } else {
          throw checkErr;
        }
      }

      setRole('admin');
      try {
        sessionStorage.setItem('auth_role', 'admin');
      } catch {}
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        throw new Error('ইমেইল বা পাসওয়ার্ড সঠিক নয়');
      }
      if (err.code === 'auth/unauthorized-domain') {
        throw new Error('এই ডোমেনটি Firebase Console-এ অনুমোদিত নয়। Firebase Console > Authentication > Settings > Authorized Domains-এ আপনার ডোমেনটি যুক্ত করুন।');
      }
      throw err;
    }
  };

  const loginWithGoogle = async () => {
    clearError();
    try {
      // Use clean standard Google Auth Provider (ZERO Drive scopes = instant login, no developer verification warning)
      const result = await signInWithPopup(auth, cleanUserGoogleProvider);

      const isOwner = isOwnerEmail(result.user.email);
      if (isOwner) {
        const adminDocRef = doc(db, 'admins', result.user.uid);
        const adminDoc = await getDoc(adminDocRef);
        if (!adminDoc.exists()) {
          try {
            await setDoc(adminDocRef, {
              email: result.user.email,
              role: 'admin',
              createdAt: serverTimestamp(),
            });
          } catch (e) {
            console.warn('Admin doc init warning:', e);
          }
        }
        setRole('admin');
        return;
      }

      // Check / ensure user profile exists in Firestore
      const userDocRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        const adminDoc = await getDoc(doc(db, 'admins', result.user.uid));
        if (!adminDoc.exists()) {
          try {
            await setDoc(userDocRef, {
              email: result.user.email || '',
              displayName: result.user.displayName || '',
              role: 'user',
              createdAt: serverTimestamp(),
            });
          } catch (e) {
            console.warn('User document init warning:', e);
          }
        }
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        throw new Error('Google লগইন উইন্ডো বন্ধ করা হয়েছে');
      }
      if (err.code === 'auth/unauthorized-domain') {
        throw new Error('এই ডোমেনটি Firebase Console-এ অনুমোদিত নয়। Firebase Console > Authentication > Settings > Authorized Domains-এ আপনার Cloudflare ডোমেন যুক্ত করুন।');
      }
      throw new Error(err.message || 'Google দিয়ে লগইন ব্যর্থ হয়েছে');
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
