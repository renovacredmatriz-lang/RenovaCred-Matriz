import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, User as FirebaseUser, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';

interface AppUser {
  id: string;
  uid: string;
  nome: string;
  email: string;
  role: 'MASTER' | 'COBRADOR';
  ativo: boolean;
  foto_perfil?: string;
  comissao_percentual?: number;
  createdAt?: string;
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
        try {
          // 1. Buscar o usuário no Firestore usando o UID (na collection users)
          let userDocRef: any = null;
          let userData: any = null;

          const qUsers = query(collection(db, 'users'), where('uid', '==', user.uid));
          const usersSnapshot = await getDocs(qUsers);
          
          if (!usersSnapshot.empty) {
            if (usersSnapshot.docs.length > 1) {
              console.warn(`Aviso: Múltiplos usuários encontrados com o UID ${user.uid} na coleção users. Utilizando o primeiro registro válido.`);
            }
            userDocRef = usersSnapshot.docs[0].ref;
            userData = usersSnapshot.docs[0].data();
          } else {
            // Se não achou pelo uid, tenta buscar pelo email na collection users (caso criado pelo MASTER)
            if (user.email) {
              const qUsersEmail = query(collection(db, 'users'), where('email', '==', user.email));
              const usersEmailSnapshot = await getDocs(qUsersEmail);
              if (!usersEmailSnapshot.empty) {
                if (usersEmailSnapshot.docs.length > 1) {
                  console.warn(`Aviso: Múltiplos usuários encontrados com o email ${user.email} na coleção users.`);
                  let bestDoc = usersEmailSnapshot.docs[0];
                  for (const doc of usersEmailSnapshot.docs) {
                    if (doc.data().uid) {
                      bestDoc = doc;
                      break;
                    }
                  }
                  userDocRef = bestDoc.ref;
                  userData = bestDoc.data();
                } else {
                  userDocRef = usersEmailSnapshot.docs[0].ref;
                  userData = usersEmailSnapshot.docs[0].data();
                }
              }
            }
          }

          if (userData) {
            // Usuário encontrado na collection users
            // Garantir que o campo role exista (migração de tipo_usuario para role)
            const role = userData.role || userData.tipo_usuario || 'COBRADOR';
            
            // Garantir que o campo uid exista no documento
            if (!userData.uid || userData.role !== role) {
              await updateDoc(userDocRef, { uid: user.uid, role });
            }

            setAppUser({ id: userDocRef.id, ...userData, uid: user.uid, role } as AppUser);
          } else {
            // 2. Se NÃO existir -> procurar pelo email na coleção "cobradores"
            let cobradoresSnapshot: any = { empty: true, docs: [] as any[] };
            if (user.email) {
              const qCobradores = query(collection(db, 'cobradores'), where('email', '==', user.email));
              cobradoresSnapshot = await getDocs(qCobradores);
            }
            
            if (!cobradoresSnapshot.empty) {
              if (cobradoresSnapshot.docs.length > 1) {
                console.warn(`Aviso: Múltiplos cobradores encontrados com o email ${user.email} na coleção cobradores.`);
              }
              // 3. Se encontrar pelo email:
              let bestCobradorDoc = cobradoresSnapshot.docs[0];
              for (const doc of cobradoresSnapshot.docs) {
                if (doc.data().uid) {
                  bestCobradorDoc = doc;
                  break;
                }
              }
              
              const cobradorDoc = bestCobradorDoc;
              const cobradorData = cobradorDoc.data();
              
              // Atualizar esse registro adicionando o campo "uid" com o user.uid
              await updateDoc(doc(db, 'cobradores', cobradorDoc.id), { uid: user.uid });
              
              // 5. Padronizar o sistema para usar apenas UMA collection: "users"
              const newUser: Omit<AppUser, 'id'> = {
                uid: user.uid,
                nome: cobradorData.nome || user.displayName || '',
                email: user.email!,
                role: 'COBRADOR',
                ativo: cobradorData.ativo !== undefined ? cobradorData.ativo : true,
                comissao_percentual: cobradorData.comissao_percentual || 0,
                foto_perfil: user.photoURL || undefined,
                createdAt: cobradorData.createdAt || new Date().toISOString()
              };
              
              await setDoc(doc(db, 'users', user.uid), newUser);
              setAppUser({ id: user.uid, ...newUser });
              
            } else {
              // 4. Se NÃO encontrar nem por UID nem por email:
              // Criar automaticamente um novo usuário na coleção "users"
              
              // Verificação final de segurança para garantir unicidade por email antes de criar
              let emailAlreadyExists = false;
              if (user.email) {
                const checkEmail = await getDocs(query(collection(db, 'users'), where('email', '==', user.email)));
                if (!checkEmail.empty) {
                  emailAlreadyExists = true;
                  console.warn(`Aviso: Email ${user.email} já existe na coleção users. Reutilizando registro para evitar duplicação.`);
                  
                  let bestDoc = checkEmail.docs[0];
                  for (const doc of checkEmail.docs) {
                    if (doc.data().uid) {
                      bestDoc = doc;
                      break;
                    }
                  }
                  
                  const existingData = bestDoc.data();
                  const role = existingData.role || existingData.tipo_usuario || 'COBRADOR';
                  
                  if (!existingData.uid || existingData.role !== role) {
                    await updateDoc(bestDoc.ref, { uid: user.uid, role });
                  }
                  
                  setAppUser({ id: bestDoc.id, ...existingData, uid: user.uid, role } as AppUser);
                }
              }

              if (!emailAlreadyExists) {
                const isMaster = user.email === 'renovacredmatriz@gmail.com';
                const newUser: Omit<AppUser, 'id'> = {
                  uid: user.uid,
                  nome: user.displayName || user.email?.split('@')[0] || 'Usuário',
                  email: user.email!,
                  role: isMaster ? 'MASTER' : 'COBRADOR',
                  ativo: true,
                  foto_perfil: user.photoURL || undefined,
                  createdAt: new Date().toISOString()
                };
                
                await setDoc(doc(db, 'users', user.uid), newUser);
                setAppUser({ id: user.uid, ...newUser });
              }
            }
          }
        } catch (error) {
          console.error("Erro ao carregar dados do usuário:", error);
          setAppUser(null);
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
