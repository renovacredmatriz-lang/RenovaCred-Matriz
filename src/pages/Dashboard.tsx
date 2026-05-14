import React, { useEffect, useState } from 'react';
import { useAuth, OperationType } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
import { Card, CardContent } from '../components/ui/Card';
import { DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { collection, query, getDocs, where, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { getAgendamentoStatusLogico, normalizeDate } from '../utils/agendamentoUtils';

export default function Dashboard() {
  const { appUser, handlePermissionError } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const [stats, setStats] = useState({
    totalNegociado: 0,
    totalRecebido: 0,
    totalAReceber: 0,
    agendamentosHoje: 0,
    totalComissaoCobradores: 0,
    comissaoMaster: 0,
    comissaoSocio: 0,
    percentualMaster: 10,
    percentualSocio: 5,
    performancePorCobrador: [] as { id: string; nome: string; total: number; comissao: number }[],
    performancePorEmpresa: [] as { id: string; nome: string; total: number }[],
  });
  
  const [cobradores, setCobradores] = useState<{ id: string; nome: string; comissao_percentual: number }[]>([]);
  const [empresas, setEmpresas] = useState<{ id: string; nome: string; nomeFantasia?: string }[]>([]);
  
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: ''
  });

  useEffect(() => {
    if (!appUser) return;

    const fetchAuxData = async () => {
      try {
        if (appUser.role === 'MASTER') {
          const cobSnapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'COBRADOR')));
          setCobradores(cobSnapshot.docs.map(doc => ({ 
            id: doc.id, 
            nome: doc.data().nome,
            comissao_percentual: doc.data().comissao_percentual || 0
          })));
        }
        
        let qEmp = query(collection(db, 'empresas'));
        if (appUser.role === 'COBRADOR') {
          qEmp = query(collection(db, 'empresas'), where('cobradorId', '==', appUser.uid));
        }
        const empSnapshot = await getDocs(qEmp);
        setEmpresas(empSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          nome: doc.data().nome,
          nomeFantasia: doc.data().nomeFantasia 
        })));
      } catch (error) {
        handlePermissionError(error, OperationType.LIST, 'auxData');
      }
    };
    fetchAuxData();
  }, [appUser, handlePermissionError]);

  useEffect(() => {
    if (!appUser) return;

    const fetchStats = async () => {
      try {
        // 1. Fetch Movimentacoes (PAGAMENTO) for Total Recebido
        let qMov = query(collection(db, 'movimentacoes'));
        if (appUser.role === 'COBRADOR') {
          qMov = query(qMov, where('cobrador_id', '==', appUser.id));
        }
        if (selectedEmpresa && appUser.role !== 'MASTER') {
          qMov = query(qMov, where('empresaId', '==', selectedEmpresa.id));
        }
        const movSnapshot = await getDocs(qMov);
        const allDocs = [...movSnapshot.docs];

        // Fetch Negociacoes to act as Source of Truth
        let qNeg = query(collection(db, 'negociacoes'));
        if (selectedEmpresa && appUser.role !== 'MASTER') {
          qNeg = query(qNeg, where('empresaId', '==', selectedEmpresa.id));
        }
        const negSnapshot = await getDocs(qNeg);
        const negStatusMap: Record<string, string> = {};
        negSnapshot.docs.forEach(d => {
          negStatusMap[d.id] = d.data().status;
        });

        let totalRecebido = 0;
        const cobradorMap: Record<string, number> = {};
        const empresaMap: Record<string, number> = {};

        allDocs.forEach(doc => {
          const data = doc.data();
          
          if (!['PAGAMENTO', 'ENTRADA', 'QUITACAO', 'RESGATE', 'ESTORNO'].includes(data.tipo)) return;
          
          // SOURCE OF TRUTH CHECK
          // We check the parent negotiation status. If missing (old data), fallback to mov.negociacao_status.
          const currentStatus = data.negociacao_id ? negStatusMap[data.negociacao_id] : data.negociacao_status;
          if (currentStatus === 'ESTORNADO') return;

          // Apply date filters
          const rawDate = new Date(data.data);
          const dataMov = new Date(
            rawDate.getFullYear(),
            rawDate.getMonth(),
            rawDate.getDate(),
            12, 0, 0
          );

          if (filtros.dataInicio) {
            const [y1, m1, d1] = filtros.dataInicio.split('-');
            const dataInicio = new Date(Number(y1), Number(m1) - 1, Number(d1));
            dataInicio.setHours(0, 0, 0, 0);
            if (dataMov.getTime() < dataInicio.getTime()) return;
          }
          if (filtros.dataFim) {
            const [y2, m2, d2] = filtros.dataFim.split('-');
            const dataFim = new Date(Number(y2), Number(m2) - 1, Number(d2));
            dataFim.setHours(23, 59, 59, 999);
            if (dataMov.getTime() > dataFim.getTime()) return;
          }

          const valor = Number(data.valor) || 0;
          const isEstorno = data.tipo === 'ESTORNO';
          const valorReal = isEstorno ? -valor : valor;
          
          totalRecebido += valorReal;

          if (appUser.role === 'MASTER') {
            const cId = data.cobrador_id || data.uid;
            if (cId) cobradorMap[cId] = (cobradorMap[cId] || 0) + valorReal;
            if (data.empresaId) empresaMap[data.empresaId] = (empresaMap[data.empresaId] || 0) + valorReal;
          }
        });

        // 2. Fetch Parcelas (PENDENTE/ATRASADO) for Total a Receber
        let qPar = query(collection(db, 'parcelas'), where('status', 'in', ['PENDENTE', 'ATRASADO']));
        if (appUser.role === 'COBRADOR') {
          qPar = query(qPar, where('cobrador_id', '==', appUser.id));
        }
        if (selectedEmpresa && appUser.role !== 'MASTER') {
          qPar = query(qPar, where('empresaId', '==', selectedEmpresa.id));
        }
        const parSnapshot = await getDocs(qPar);
        let totalAReceber = 0;
        parSnapshot.docs.forEach(doc => {
          totalAReceber += (Number(doc.data().valor) || 0);
        });

        const totalNegociado = totalRecebido + totalAReceber;

        // 3. Performance and Commissions
        const performancePorCobrador = Object.entries(cobradorMap)
          .map(([id, total]) => {
            const cobrador = cobradores.find(c => c.id === id);
            const comissao = total * ((cobrador?.comissao_percentual || 0) / 100);
            return { 
              id, 
              nome: cobrador?.nome || 'Desconhecido', 
              total,
              comissao
            };
          })
          .sort((a, b) => b.total - a.total);

        const totalComissaoCobradores = appUser.role === 'MASTER' 
          ? performancePorCobrador.reduce((acc, curr) => acc + curr.comissao, 0)
          : totalRecebido * ((appUser.comissao_percentual || 0) / 100);

        // Fetch Global Settings for Commissions
        let pMaster = 10;
        let pSocio = 5;
        try {
          const configDoc = await getDoc(doc(db, 'auxData', 'configGlobal'));
          if (configDoc.exists()) {
            const data = configDoc.data();
            if (data.comissao_master !== undefined) pMaster = data.comissao_master;
            if (data.comissao_socio !== undefined) pSocio = data.comissao_socio;
          }
        } catch (e) {
          console.error("Error reading global config:", e);
        }

        const comissaoMaster = totalRecebido * (pMaster / 100);
        const comissaoSocio = totalRecebido * (pSocio / 100);

        const performancePorEmpresa = Object.entries(empresaMap)
          .map(([id, total]) => {
            const emp = empresas.find(e => e.id === id);
            const nomeExibicao = emp ? (emp.nomeFantasia || emp.nome || "Empresa sem nome") : "Desconhecida";
            return { id, nome: nomeExibicao, total };
          })
          .sort((a, b) => b.total - a.total);

        // 4. Fetch Agendamentos Hoje
        const hojeInicio = new Date();
        hojeInicio.setHours(0, 0, 0, 0);
        
        const hojeFim = new Date();
        hojeFim.setHours(23, 59, 59, 999);

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
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        agendSnapshot.docs.forEach(doc => {
          const data = doc.data();
          const statusLogico = getAgendamentoStatusLogico(data.status, data.data_agendamento);
          const agendDate = normalizeDate(data.data_agendamento);
          
          if (agendDate && statusLogico === 'PENDENTE' && agendDate.getTime() === today.getTime()) {
            agendamentosHoje++;
          }
        });

        setStats({
          totalNegociado,
          totalRecebido,
          totalAReceber,
          agendamentosHoje,
          totalComissaoCobradores,
          comissaoMaster,
          comissaoSocio,
          percentualMaster: pMaster,
          percentualSocio: pSocio,
          performancePorCobrador,
          performancePorEmpresa
        });
      } catch (error) {
        handlePermissionError(error, OperationType.LIST, 'stats');
      }
    };

    fetchStats();
  }, [appUser, filtros, selectedEmpresa, cobradores, empresas, handlePermissionError]);

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

      {appUser?.role === 'MASTER' ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-blue-200 rounded-md p-3">
                  <DollarSign className="h-6 w-6 text-blue-700" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-blue-700 truncate">Comissão Master ({stats.percentualMaster}%)</dt>
                    <dd className="text-2xl font-bold text-blue-900">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.comissaoMaster)}
                    </dd>
                  </dl>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-indigo-50 border-indigo-200">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-indigo-200 rounded-md p-3">
                  <DollarSign className="h-6 w-6 text-indigo-700" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-indigo-700 truncate">Comissão Sócio ({stats.percentualSocio}%)</dt>
                    <dd className="text-2xl font-bold text-indigo-900">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.comissaoSocio)}
                    </dd>
                  </dl>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-teal-50 border-teal-200">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-teal-200 rounded-md p-3">
                  <DollarSign className="h-6 w-6 text-teal-700" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-teal-700 truncate">Total Comissões Cobradores</dt>
                    <dd className="text-2xl font-bold text-teal-900">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalComissaoCobradores)}
                    </dd>
                  </dl>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="bg-teal-50 border-teal-200">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-teal-200 rounded-md p-3">
                  <DollarSign className="h-6 w-6 text-teal-700" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-teal-700 truncate">Minha Comissão ({appUser?.comissao_percentual || 0}%)</dt>
                    <dd className="text-2xl font-bold text-teal-900">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalComissaoCobradores)}
                    </dd>
                  </dl>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
                      <div className="ml-2">
                        <div className="text-sm font-medium text-gray-900">{item.nome}</div>
                        <div className="text-xs text-blue-500 font-semibold">
                          Comissão: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.comissao)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-gray-900">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total)}
                      </div>
                      <div className="text-xs text-gray-400">Total Recebido</div>
                    </div>
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
