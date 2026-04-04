import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
import { Card, CardContent } from '../components/ui/Card';
import { DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';

export default function Dashboard() {
  const { appUser } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const [stats, setStats] = useState({
    totalNegociado: 0,
    totalRecebido: 0,
    totalAReceber: 0,
    agendamentosHoje: 0,
  });
  
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: ''
  });

  useEffect(() => {
    if (!appUser) return;

    const fetchStats = async () => {
      try {
        // Fetch Negociacoes
        let qNegociacoes = query(collection(db, 'negociacoes'));
        
        const filters = [];
        if (appUser.role === 'COBRADOR') {
          filters.push(where('cobrador_id', '==', appUser.id));
        }
        if (selectedEmpresa) {
          filters.push(where('empresa_id', '==', selectedEmpresa.id));
        }

        if (filters.length > 0) {
          qNegociacoes = query(collection(db, 'negociacoes'), ...filters);
        }

        const negSnapshot = await getDocs(qNegociacoes);
        
        let totalNegociado = 0;
        let totalRecebido = 0;

        negSnapshot.docs.forEach(doc => {
          const data = doc.data();
          
          // Apply date filters
          if (filtros.dataInicio) {
            if (new Date(data.createdAt) < new Date(filtros.dataInicio)) return;
          }
          if (filtros.dataFim) {
            const dataFim = new Date(filtros.dataFim);
            dataFim.setHours(23, 59, 59, 999);
            if (new Date(data.createdAt) > dataFim) return;
          }

          if (data.status === 'ESTORNADO') return;

          if (data.tipo === 'QUITACAO' || data.tipo === 'PARCELA' || data.tipo === 'RESGATE') {
            totalNegociado += data.valor;
            totalRecebido += data.valor;
          } else if (data.tipo === 'PARCELAMENTO') {
            totalNegociado += data.valor;
            totalRecebido += (data.valor_entrada || 0);
          }
        });

        const totalAReceber = totalNegociado - totalRecebido;

        // Fetch Agendamentos Hoje
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let qAgendamentos = query(collection(db, 'agendamentos'));
        
        const agendFilters = [];
        if (appUser.role === 'COBRADOR') {
          agendFilters.push(where('cobrador_id', '==', appUser.id));
        }
        if (selectedEmpresa) {
          agendFilters.push(where('empresa_id', '==', selectedEmpresa.id));
        }

        if (agendFilters.length > 0) {
          qAgendamentos = query(collection(db, 'agendamentos'), ...agendFilters);
        }

        const agendSnapshot = await getDocs(qAgendamentos);
        
        let agendamentosHoje = 0;
        agendSnapshot.docs.forEach(doc => {
          const data = doc.data();
          const agendDate = new Date(data.data_agendamento);
          if (agendDate >= today && agendDate < tomorrow && data.status === 'PENDENTE') {
            agendamentosHoje++;
          }
        });

        setStats({
          totalNegociado,
          totalRecebido,
          totalAReceber,
          agendamentosHoje
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    fetchStats();
  }, [appUser, filtros, selectedEmpresa]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Bem-vindo de volta, {appUser?.nome}. Aqui está o resumo das suas atividades.
          </p>
        </div>
        
        <div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm border border-gray-200">
          <div>
            <input
              type="date"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-1.5 border"
              value={filtros.dataInicio}
              onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })}
              title="Data Início"
            />
          </div>
          <span className="text-gray-500">até</span>
          <div>
            <input
              type="date"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-1.5 border"
              value={filtros.dataFim}
              onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })}
              title="Data Fim"
            />
          </div>
          <button 
            onClick={() => setFiltros({ dataInicio: '', dataFim: '' })}
            className="text-sm text-blue-600 hover:text-blue-800 px-2"
          >
            Limpar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-blue-100 rounded-md p-3">
                <DollarSign className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Negociado</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalNegociado)}
                  </dd>
                </dl>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-green-100 rounded-md p-3">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Recebido</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalRecebido)}
                  </dd>
                </dl>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-yellow-100 rounded-md p-3">
                <DollarSign className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total a Receber</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalAReceber)}
                  </dd>
                </dl>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-purple-100 rounded-md p-3">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Agendamentos Hoje</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{stats.agendamentosHoje}</dd>
                </dl>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
