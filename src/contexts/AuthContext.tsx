import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, secondaryAuth } from '../firebase';
import { onAuthStateChanged, User as FirebaseUser, signInWithEmailAndPassword, updatePassword, signOut, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';

interface AppUser {
  id: string;
  uid: string;
  username: string;
  nome: string;
  email: string;
  role: 'MASTER' | 'COBRADOR' | 'CREDOR';
  ativo: boolean;
  primeiroAcesso?: boolean;
  empresaId?: string;
  foto_perfil?: string;
  comissao_percentual?: number;
  createdAt?: string;
}

interface AuthContextType {
  currentUser: FirebaseUser | null;
  appUser: AppUser | null;
  loading: boolean;
  isCheckingAuth: boolean;
  authError: string | null;
  requirePasswordChange: boolean;
  loginWithCredentials: (username: string, pass: string) => Promise<void>;
  changePassword: (newPass: string) => Promise<void>;
  logout: () => Promise<void>;
  handlePermissionError: (error: any, operation: string, path: string) => Promise<void>;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: string;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);

  const handlePermissionError = async (error: any, operation: string, path: string) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType: operation,
      path
    };
    
    console.error("Firestore Error Details:", JSON.stringify(errInfo, null, 2));
    
    if (error.code === 'permission-denied' || error.message?.includes('insufficient permissions')) {
      setAuthError("Acesso negado: Você não tem permissão para realizar esta operação.");
    } else {
      setAuthError(error.message || "Erro de comunicação com o banco de dados.");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsCheckingAuth(true);
      setCurrentUser(user);
      
      if (!user || !user.email) {
        setAppUser(null);
        setRequirePasswordChange(false);
        setIsCheckingAuth(false);
        setLoading(false);
        return;
      }

      setAuthError(null);
      const email = user.email.toLowerCase().trim();

      try {
        // 1. Validação Obrigatória no Firestore
        const userDocRef = doc(db, 'users', user.uid);
        let userDocSnap;
        try {
          userDocSnap = await getDoc(userDocRef);
        } catch (error) {
          await handlePermissionError(error, OperationType.GET, `users/${user.uid}`);
          throw error;
        }
        
        let userData = null;
        let finalDocRef = userDocRef;

        if (userDocSnap.exists()) {
          userData = userDocSnap.data();
        }

        // 3. Validação Final de Autorização
        if (!userData) {
          throw new Error("Usuário não autorizado no banco de dados. Entre em contato com o administrador.");
        }

        const role = userData.role || userData.tipo_usuario || 'COBRADOR';
        if (!['MASTER', 'COBRADOR', 'CREDOR'].includes(role)) {
          throw new Error("Acesso restrito: Perfil sem permissão.");
        }

        if (userData.ativo === false) {
          throw new Error("Sua conta está inativa. Contate o administrador.");
        }

        // Sincronizar dados básicos se necessário
        const updates: any = {};
        if (userData.uid !== user.uid) updates.uid = user.uid;
        
        if (Object.keys(updates).length > 0) {
          await updateDoc(finalDocRef, updates);
        }

        if (userData.primeiroAcesso) {
          setRequirePasswordChange(true);
        } else {
          setRequirePasswordChange(false);
        }

        setAppUser({ id: finalDocRef.id, ...userData, ...updates } as AppUser);
      } catch (error: any) {
        console.error("Falha na blindagem de segurança:", error);
        setAuthError(error.message || "Erro de autorização.");
        setAppUser(null);
        setCurrentUser(null);
        await signOut(auth);
      } finally {
        setIsCheckingAuth(false);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const loginWithCredentials = async (username: string, pass: string) => {
    try {
      setAuthError(null);
      setIsCheckingAuth(true);
      const email = `${username.toLowerCase().trim()}@app.renovacred.com`;
      
      try {
        await signInWithEmailAndPassword(auth, email, pass);
      } catch (error: any) {
        // Bootstrap admin user if it doesn't exist and credentials match
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
          if (username.toLowerCase().trim() === 'admin' && pass === 'admin123') {
            try {
              const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
              await setDoc(doc(db, 'users', userCredential.user.uid), {
                uid: userCredential.user.uid,
                username: 'admin',
                nome: 'Administrador',
                email: email,
                role: 'MASTER',
                ativo: true,
                primeiroAcesso: false,
                createdAt: new Date().toISOString()
              });
              return;
            } catch (bootstrapError) {
              console.error("Erro ao criar admin:", bootstrapError);
            }
          }
        }
        throw error;
      }
    } catch (error: any) {
      console.error("Erro no login:", error);
      setAuthError("Usuário ou senha inválidos.");
      setIsCheckingAuth(false);
    }
  };

  const changePassword = async (newPass: string) => {
    try {
      setAuthError(null);
      setIsCheckingAuth(true); // Signal we are performing an auth operation
      
      const user = auth.currentUser;
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Atualizar a senha no Firebase Authentication
      await updatePassword(user, newPass);

      // 2. Atualizar o flag de primeiro acesso no Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { 
        primeiroAcesso: false,
        updatedAt: new Date().toISOString()
      });

      // 3. Sincronizar estados locais
      if (appUser) {
        setAppUser({ ...appUser, primeiroAcesso: false });
      }
      setRequirePasswordChange(false);
      
    } catch (error: any) {
      console.error("Erro ao alterar senha:", error);
      if (error.code === 'auth/requires-recent-login') {
        setAuthError("Para sua segurança, esta operação requer um login recente. Por favor, saia e entre novamente.");
      } else {
        setAuthError("Erro ao alterar a senha. Tente novamente.");
      }
      throw error;
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const logout = async () => {
    setAppUser(null);
    setCurrentUser(null);
    setRequirePasswordChange(false);
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      appUser, 
      loading, 
      isCheckingAuth, 
      authError,
      requirePasswordChange,
      loginWithCredentials,
      changePassword,
      logout,
      handlePermissionError
    }}>
      {children}
    </AuthContext.Provider>
  );
}
