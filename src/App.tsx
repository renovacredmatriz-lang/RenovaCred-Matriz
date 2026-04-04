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
  const { currentUser, appUser } = useAuth();
  
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  if (!appUser) {
    // Waiting for appUser to load or user not registered
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
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
