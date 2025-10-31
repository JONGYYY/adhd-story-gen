'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';
import { getClientAuth, Auth } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  logout: async () => {},
  signInWithGoogle: async () => {},
  resetPassword: async () => {},
});

// WARNING: This provider uses useSearchParams and must only be used in client components/pages.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get the redirect URL from query params
  const getRedirectPath = () => searchParams.get('from') || '/create';

  // Create session cookie
  const createSession = async (user: User) => {
    try {
      console.log('Getting ID token for session creation...');
      const idToken = await user.getIdToken(true); // Force refresh the token
      console.log('ID token obtained, creating session...');
      
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Session creation failed:', errorData);
        throw new Error(errorData.error || 'Failed to create session');
      }

      console.log('Session created successfully');
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  };

  // Handle auth state changes
  useEffect(() => {
    const auth = getClientAuth();
    // Check if Firebase auth is properly initialized
    if (!auth) {
      console.error('Firebase auth is not initialized');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);

      if (user) {
        try {
          await createSession(user);
          // Only redirect if we're on an auth page
          const path = window.location.pathname;
          if (path.startsWith('/auth/')) {
            router.push(getRedirectPath());
          }
        } catch (error) {
          console.error('Error in auth state change:', error);
          // If session creation fails, sign out
          try {
            if (auth) {
              await signOut(auth);
            }
          } catch {}
          setUser(null);
        }
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const signIn = async (email: string, password: string) => {
    const auth = getClientAuth();
    if (!auth) {
      throw new Error('Firebase auth is not initialized');
    }
    const result = await signInWithEmailAndPassword(auth, email, password);
    await createSession(result.user);
    router.push(getRedirectPath());
  };

  const signUp = async (email: string, password: string) => {
    const auth = getClientAuth();
    if (!auth) {
      throw new Error('Firebase auth is not initialized');
    }
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await createSession(result.user);
    router.push(getRedirectPath());
  };

  const signInWithGoogle = async () => {
    const auth = getClientAuth();
    if (!auth) {
      throw new Error('Firebase auth is not initialized');
    }
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    await createSession(result.user);
    router.push(getRedirectPath());
  };

  const logout = async () => {
    const auth = getClientAuth();
    if (!auth) {
      throw new Error('Firebase auth is not initialized');
    }
    await signOut(auth);
    // Clear the session cookie
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
    } catch (error) {
      console.error('Error clearing session cookie:', error);
    }
    router.push('/auth/login');
  };

  const resetPassword = async (email: string) => {
    if (!auth) {
      throw new Error('Firebase auth is not initialized');
    }
    await sendPasswordResetEmail(auth, email);
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        loading,
        signIn, 
        signUp, 
        logout,
        signInWithGoogle,
        resetPassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 