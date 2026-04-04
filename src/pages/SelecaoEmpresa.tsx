import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Building2, ArrowRight, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Empresa {
  id: string;
  nome: string;
  ativo: boolean;
}

export default function SelecaoEmpresa() {
  const { appUser, logout } = useAuth();
  const { setSelectedEmpresa } = useEmpresa();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchEmpresas = async () => {
      try {
        // Por enquanto, listamos todas as empresas ativas.
        // Se houver uma regra de negócio específica de mapeamento cobrador -> empresa,
        // ela deve ser aplicada aqui.
        const q = query(collection(db, 'empresas'), where('ativo', '==', true));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Empresa));
        setEmpresas(data);
      } catch (error) {
        console.error("Erro ao buscar empresas:", error);
      } finally {
        setLoading(false);
      }
    };

    if (appUser) {
      fetchEmpresas();
    }
  }, [appUser]);

  const handleSelect = (empresa: Empresa) => {
    setSelectedEmpresa(empresa);
    navigate('/');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando empresas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Selecionar Empresa</h1>
          <p className="mt-2 text-gray-600">
            Olá, <span className="font-semibold text-gray-900">{appUser?.nome}</span>. 
            Escolha uma empresa para começar.
          </p>
        </div>

        <div className="space-y-4">
          {empresas.map((empresa) => (
            <Card 
              key={empresa.id}
              className="hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => handleSelect(empresa)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{empresa.nome}</h3>
                    <p className="text-xs text-gray-500">Empresa Ativa</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-blue-600 transition-colors" />
              </CardContent>
            </Card>
          ))}

          {empresas.length === 0 && (
            <div className="text-center p-8 bg-white rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-500">Nenhuma empresa disponível no momento.</p>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}
