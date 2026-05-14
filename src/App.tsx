import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { EmpresaProvider, useEmpresa } from './contexts/EmpresaContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Empresas from './pages/Empresas';
import Cobradores from './pages/Cobradores';
import Clientes from './pages/Clientes';
import Negociacoes from './pages/Negociacoes';
import Parcelas from './pages/Parcelas';
import Agendamentos from './pages/Agendamentos';
import Relatorios from './pages/Relatorios';
import Configuracoes from './pages/Configuracoes';
import SelecaoEmpresa from './pages/SelecaoEmpresa';
import Fatura from './pages/Fatura';
import Recibo from './pages/Recibo';
import MensagensAuto from './pages/MensagensAuto';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, appUser, loading, isCheckingAuth, requirePasswordChange } = useAuth();
  const { selectedEmpresa, setSelectedEmpresa, clearSelectedEmpresa } = useEmpresa();
  const location = useLocation();
  const [loadingEmpresaCredor, setLoadingEmpresaCredor] = React.useState(false);
  
  React.useEffect(() => {
    if (appUser?.role === 'MASTER' && selectedEmpresa) {
      clearSelectedEmpresa();
    }
  }, [appUser, selectedEmpresa, clearSelectedEmpresa]);

  React.useEffect(() => {
    if (appUser?.role === 'CREDOR' && appUser.empresaId && !selectedEmpresa) {
      setLoadingEmpresaCredor(true);
      getDoc(doc(db, 'empresas', appUser.empresaId)).then(docSnap => {
        if (docSnap.exists()) {
          setSelectedEmpresa({
            id: docSnap.id,
            nome: docSnap.data().nomeFantasia || docSnap.data().nome || 'Minha Empresa',
            nomeFantasia: docSnap.data().nomeFantasia,
            ativo: docSnap.data().ativo,
            cobradorId: docSnap.data().cobradorId
          });
        }
        setLoadingEmpresaCredor(false);
      }).catch(err => {
        console.error("Erro ao carregar empresa do credor", err);
        setLoadingEmpresaCredor(false);
      });
    }
  }, [appUser, selectedEmpresa, setSelectedEmpresa]);

  if (loading || isCheckingAuth || loadingEmpresaCredor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Validando Acesso Seguro...</p>
        </div>
      </div>
    );
  }

  if (!currentUser || requirePasswordChange) {
    return <Navigate to="/login" />;
  }
  
  if (!appUser) {
    // Se autenticado mas sem perfil autorizado (o AuthContext já deve ter feito logout, mas por segurança:)
    return <Navigate to="/login" />;
  }

  // Se for CREDOR tentanto acessar a raiz, joga para negociações
  if (appUser.role === 'CREDOR' && location.pathname === '/') {
    return <Navigate to="/negociacoes" />;
  }

  // Se não tiver empresa selecionada, redireciona para seleção (exceto se já estiver na tela de seleção)
  // MASTER não tem obrigatoriedade de seleção de empresa, e CREDOR já tem ela carregada acima
  if (appUser.role !== 'MASTER' && appUser.role !== 'CREDOR' && !selectedEmpresa && location.pathname !== '/selecionar-empresa') {
    return <Navigate to="/selecionar-empresa" />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <EmpresaProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/selecionar-empresa" element={
              <PrivateRoute>
                <SelecaoEmpresa />
              </PrivateRoute>
            } />
            
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="empresas" element={<Empresas />} />
              <Route path="cobradores" element={<Cobradores />} />
              <Route path="clientes" element={<Clientes />} />
              <Route path="negociacoes" element={<Negociacoes />} />
              <Route path="parcelas" element={<Parcelas />} />
              <Route path="agendamentos" element={<Agendamentos />} />
              <Route path="relatorios" element={<Relatorios />} />
              <Route path="configuracoes" element={<Configuracoes />} />
              <Route path="fatura" element={<Fatura />} />
              <Route path="recibo" element={<Recibo />} />
              <Route path="cobranca-rapida" element={<MensagensAuto />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </EmpresaProvider>
    </AuthProvider>
  );
}
