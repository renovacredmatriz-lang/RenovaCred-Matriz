import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface Empresa {
  id: string;
  nome: string; // Legado
  nomeFantasia?: string;
  ativo: boolean;
  cobradorId?: string;
}

interface EmpresaContextType {
  selectedEmpresa: Empresa | null;
  setSelectedEmpresa: (empresa: Empresa | null) => void;
  clearSelectedEmpresa: () => void;
}

const EmpresaContext = createContext<EmpresaContextType>({} as EmpresaContextType);

export function useEmpresa() {
  return useContext(EmpresaContext);
}

export function EmpresaProvider({ children }: { children: React.ReactNode }) {
  const [selectedEmpresa, setSelectedEmpresaState] = useState<Empresa | null>(() => {
    const saved = localStorage.getItem('selectedEmpresa');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (selectedEmpresa?.id) {
      const unsub = onSnapshot(doc(db, 'empresas', selectedEmpresa.id), (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as Empresa;
          setSelectedEmpresaState(data);
          localStorage.setItem('selectedEmpresa', JSON.stringify(data));
        }
      });
      return () => unsub();
    }
  }, [selectedEmpresa?.id]);

  const setSelectedEmpresa = (empresa: Empresa | null) => {
    setSelectedEmpresaState(empresa);
    if (empresa) {
      localStorage.setItem('selectedEmpresa', JSON.stringify(empresa));
    } else {
      localStorage.removeItem('selectedEmpresa');
    }
  };

  const clearSelectedEmpresa = () => {
    setSelectedEmpresa(null);
  };

  return (
    <EmpresaContext.Provider value={{ selectedEmpresa, setSelectedEmpresa, clearSelectedEmpresa }}>
      {children}
    </EmpresaContext.Provider>
  );
}
