import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, ShieldCheck, TrendingUp } from 'lucide-react';

export default function Login() {
  const { currentUser, loginWithGoogle } = useAuth();

  if (currentUser) {
    return <Navigate to="/" />;
  }

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
            <button
              onClick={loginWithGoogle}
              className="w-full flex items-center justify-center py-4 px-4 border border-transparent rounded-xl shadow-md text-base font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 ease-in-out transform hover:-translate-y-0.5"
            >
              <div className="bg-white p-1 rounded-full mr-3">
                <img 
                  className="h-5 w-5" 
                  src="https://www.svgrepo.com/show/475656/google-color.svg" 
                  alt="Google logo" 
                />
              </div>
              Entrar com Google
            </button>
            
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
