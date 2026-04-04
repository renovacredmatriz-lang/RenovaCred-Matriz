import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, User as FirebaseUser, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface AppUser {
  id: string;
  nome: string;
  email: string;
  tipo_usuario: 'MASTER' | 'COBRADOR';
  ativo: boolean;
  foto_perfil?: string;
  comissao_percentual?: number;
}

interface AuthContextType {
  currentUser: FirebaseUser | null;
  appUser: AppUser | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch user document
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          setAppUser({ id: userDoc.id, ...userDoc.data() } as AppUser);
        } else {
          // If the user is the master admin (from prompt), create the document
          if (user.email === 'renovacredmatriz@gmail.com') {
            const newMaster: Omit<AppUser, 'id'> = {
              nome: user.displayName || 'Admin Master',
              email: user.email,
              tipo_usuario: 'MASTER',
              ativo: true,
              foto_perfil: user.photoURL || undefined,
            };
            await setDoc(userDocRef, { ...newMaster, createdAt: new Date().toISOString() });
            setAppUser({ id: user.uid, ...newMaster });
          } else {
            // Unregistered user
            setAppUser(null);
            await signOut(auth);
            alert('Usuário não cadastrado no sistema.');
          }
        }
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ currentUser, appUser, loading, loginWithGoogle, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
