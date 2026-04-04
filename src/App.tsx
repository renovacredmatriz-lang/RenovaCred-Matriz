import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, appUser, loading } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
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

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
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
    </AuthProvider>
  );
}
