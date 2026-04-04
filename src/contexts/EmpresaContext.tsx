import React, { createContext, useContext, useState, useEffect } from 'react';

interface Empresa {
  id: string;
  nome: string;
  ativo: boolean;
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
