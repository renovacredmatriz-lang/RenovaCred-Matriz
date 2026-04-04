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
    performancePorCobrador: [] as { id: string; nome: string; total: number }[],
    performancePorEmpresa: [] as { id: string; nome: string; total: number }[],
  });
  
  const [cobradores, setCobradores] = useState<{ id: string; nome: string }[]>([]);
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([]);
  
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: ''
  });

  useEffect(() => {
    const fetchAuxData = async () => {
      const cobSnapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'COBRADOR')));
      setCobradores(cobSnapshot.docs.map(doc => ({ id: doc.id, nome: doc.data().nome })));
      
      const empSnapshot = await getDocs(collection(db, 'empresas'));
      setEmpresas(empSnapshot.docs.map(doc => ({ id: doc.id, nome: doc.data().nome })));
    };
    fetchAuxData();
  }, []);

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
        if (selectedEmpresa && appUser.role !== 'MASTER') {
          filters.push(where('empresaId', '==', selectedEmpresa.id));
        }

        if (filters.length > 0) {
          qNegociacoes = query(collection(db, 'negociacoes'), ...filters);
        }

        const negSnapshot = await getDocs(qNegociacoes);
        
        let totalNegociado = 0;
        let totalRecebido = 0;
        const cobradorMap: Record<string, number> = {};
        const empresaMap: Record<string, number> = {};

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

          if (data.status === 'ESTORNO') return;

          let valorNegociado = 0;
          let valorRecebido = 0;

          if (data.tipo === 'QUITACAO' || data.tipo === 'PARCELA' || data.tipo === 'RESGATE') {
            valorNegociado = data.valor;
            valorRecebido = data.valor;
          } else if (data.tipo === 'PARCELAMENTO') {
            valorNegociado = data.valor;
            valorRecebido = (data.valor_entrada || 0);
          }

          totalNegociado += valorNegociado;
          totalRecebido += valorRecebido;

          if (appUser.role === 'MASTER') {
            cobradorMap[data.cobrador_id] = (cobradorMap[data.cobrador_id] || 0) + valorRecebido;
            empresaMap[data.empresaId] = (empresaMap[data.empresaId] || 0) + valorRecebido;
          }
        });

        const performancePorCobrador = Object.entries(cobradorMap)
          .map(([id, total]) => ({ id, nome: cobradores.find(c => c.id === id)?.nome || 'Desconhecido', total }))
          .sort((a, b) => b.total - a.total);

        const performancePorEmpresa = Object.entries(empresaMap)
          .map(([id, total]) => ({ id, nome: empresas.find(e => e.id === id)?.nome || 'Desconhecida', total }))
          .sort((a, b) => b.total - a.total);

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
        if (selectedEmpresa && appUser.role !== 'MASTER') {
          agendFilters.push(where('empresaId', '==', selectedEmpresa.id));
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
          agendamentosHoje,
          performancePorCobrador,
          performancePorEmpresa
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    fetchStats();
  }, [appUser, filtros, selectedEmpresa, cobradores, empresas]);

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

      {appUser?.role === 'MASTER' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Desempenho por Cobrador (Ranking)</h3>
              <div className="space-y-4">
                {stats.performancePorCobrador.map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="w-6 text-sm font-bold text-gray-400">{index + 1}º</span>
                      <span className="ml-2 text-sm font-medium text-gray-900">{item.nome}</span>
                    </div>
                    <span className="text-sm font-bold text-blue-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total)}
                    </span>
                  </div>
                ))}
                {stats.performancePorCobrador.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">Nenhum dado disponível.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Desempenho por Empresa</h3>
              <div className="space-y-4">
                {stats.performancePorEmpresa.map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{item.nome}</span>
                    <span className="text-sm font-bold text-green-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total)}
                    </span>
                  </div>
                ))}
                {stats.performancePorEmpresa.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">Nenhum dado disponível.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
