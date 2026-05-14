import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, ShieldCheck, TrendingUp, Lock, User } from 'lucide-react';

export default function Login() {
  const { currentUser, appUser, loginWithCredentials, changePassword, authError, isCheckingAuth, requirePasswordChange } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  if (currentUser && !requirePasswordChange) {
    return <Navigate to="/" />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (!username || !password) {
      setLocalError('Preencha todos os campos.');
      return;
    }
    await loginWithCredentials(username, password);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (newPassword.length < 6) {
      setLocalError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError('As senhas não coincidem.');
      return;
    }
    try {
      await changePassword(newPassword);
    } catch (error: any) {
      // O AuthContext já define o authError, então só definimos localError 
      // se o authError não estiver disponível ou para erros genéricos
      if (!authError) {
        setLocalError('Erro ao processar a alteração de senha.');
      }
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Left side - Login Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:flex-none lg:w-1/2">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto w-full max-w-md"
        >
          {/* Logo */}
          <div className="flex items-center mb-12">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-3 shadow-sm">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900 tracking-tight">RenovaCred</span>
          </div>

          <div>
            <h2 className="text-4xl font-bold text-gray-900 tracking-tight">
              Bem-vindo ao RenovaCred
            </h2>
            <p className="mt-3 text-lg text-gray-600">
              Gestão inteligente de cobranças e negociações
            </p>
          </div>

          <div className="mt-10">
            {(authError || localError) && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start">
                <ShieldCheck className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700 font-medium">{authError || localError}</p>
              </div>
            )}

            {requirePasswordChange ? (
              <form onSubmit={handleChangePassword} className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Defina sua nova senha</h3>
                  <p className="text-sm text-gray-500 mb-6">Como este é o seu primeiro acesso, você precisa definir uma nova senha segura.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nova Senha</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md h-12"
                      placeholder="Mínimo 6 caracteres"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirmar Nova Senha</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md h-12"
                      placeholder="Confirme a senha"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isCheckingAuth}
                  className={`w-full flex items-center justify-center py-4 px-4 border border-transparent rounded-xl shadow-md text-base font-medium text-white transition-all duration-200 ease-in-out transform ${
                    isCheckingAuth 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5'
                  }`}
                >
                  {isCheckingAuth ? 'Salvando...' : 'Salvar Nova Senha'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Usuário</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md h-12"
                      placeholder="ex: admin"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Senha</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md h-12"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isCheckingAuth}
                  className={`w-full flex items-center justify-center py-4 px-4 border border-transparent rounded-xl shadow-md text-base font-medium text-white transition-all duration-200 ease-in-out transform ${
                    isCheckingAuth 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5'
                  }`}
                >
                  {isCheckingAuth ? (
                    <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  ) : null}
                  {isCheckingAuth ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
            )}
            
            <div className="mt-6 flex items-center justify-center text-sm text-gray-500">
              <ShieldCheck className="w-4 h-4 mr-1.5 text-gray-400" />
              Acesso seguro e restrito
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right side - Image */}
      <div className="hidden lg:block relative w-0 flex-1">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src="https://i.postimg.cc/tJK58bpq/renovacred-1024.png"
          alt="RenovaCred"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-black/40" />
        
        {/* Content over image */}
        <div className="absolute inset-0 flex flex-col justify-center px-16 lg:px-24">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="max-w-lg"
          >
            <h2 className="text-4xl font-bold text-white mb-8 leading-tight">
              Negocie com mais eficiência
            </h2>
            
            <ul className="space-y-5">
              <li className="flex items-center text-lg text-white/90">
                <CheckCircle2 className="w-6 h-6 mr-3 text-green-400 flex-shrink-0" />
                Acordos rápidos
              </li>
              <li className="flex items-center text-lg text-white/90">
                <CheckCircle2 className="w-6 h-6 mr-3 text-green-400 flex-shrink-0" />
                Controle total das cobranças
              </li>
              <li className="flex items-center text-lg text-white/90">
                <CheckCircle2 className="w-6 h-6 mr-3 text-green-400 flex-shrink-0" />
                Resultados em tempo real
              </li>
            </ul>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
