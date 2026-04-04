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

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, appUser, loading } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const location = useLocation();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  if (!appUser) {
    // User is authenticated but appUser failed to load (e.g. permission error)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <h1 className="text-xl font-bold text-red-600 mb-2">Erro de Acesso</h1>
        <p className="text-gray-600 mb-4">Não foi possível carregar seu perfil. Verifique suas permissões ou entre em contato com o administrador.</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  // Se não tiver empresa selecionada, redireciona para seleção (exceto se já estiver na tela de seleção)
  if (!selectedEmpresa && location.pathname !== '/selecionar-empresa') {
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
            </Route>
          </Routes>
        </BrowserRouter>
      </EmpresaProvider>
    </AuthProvider>
  );
}
