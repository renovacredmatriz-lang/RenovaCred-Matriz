import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Printer } from 'lucide-react';

interface Movimentacao {
  id: string;
  cliente_id: string;
  negociacao_id?: string;
  empresaId: string;
  tipo: 'PAGAMENTO' | 'NEGOCIACAO' | 'AJUSTE' | 'ESTORNO';
  valor: number;
  saldo_anterior: number;
  saldo_atual: number;
  data: string;
  cobrador_id: string;
}

interface Cliente { id: string; nome: string; empresaId: string; codigo?: string; }
interface Empresa { id: string; nome: string; }
interface Cobrador { id: string; nome: string; comissao_percentual?: number; }

export default function Relatorios() {
  const { appUser } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cobradores, setCobradores] = useState<Cobrador[]>([]);
  
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: '',
    cliente_id: '',
    cliente_search: '',
    cobrador_id: '',
    empresa_id: '',
    status: ''
  });

  useEffect(() => {
    const unsubClientes = onSnapshot(collection(db, 'clientes'), (snapshot) => {
      setClientes(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        nome: doc.data().nome, 
        empresaId: doc.data().empresaId,
        codigo: doc.data().codigo
      })));
    });
    const unsubEmpresas = onSnapshot(collection(db, 'empresas'), (snapshot) => {
      setEmpresas(snapshot.docs.map(doc => ({ id: doc.id, nome: doc.data().nome })));
    });
    const unsubCobradores = onSnapshot(collection(db, 'users'), (snapshot) => {
      setCobradores(snapshot.docs.filter(doc => doc.data().role === 'COBRADOR').map(doc => ({ 
        id: doc.id, 
        nome: doc.data().nome,
        comissao_percentual: doc.data().comissao_percentual || 0
      })));
    });
    
    let qMovimentacoes;
    if (appUser?.role === 'MASTER') {
      qMovimentacoes = query(collection(db, 'movimentacoes'), orderBy('data', 'desc'));
    } else {
      if (!selectedEmpresa) return;
      qMovimentacoes = query(collection(db, 'movimentacoes'), where('empresaId', '==', selectedEmpresa.id), orderBy('data', 'desc'));
    }

    const unsubMovimentacoes = onSnapshot(qMovimentacoes, (snapshot) => {
      setMovimentacoes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movimentacao)));
    });

    return () => {
      unsubClientes();
      unsubEmpresas();
      unsubCobradores();
      unsubMovimentacoes();
    };
  }, [selectedEmpresa]);

  const handlePrint = () => {
    window.print();
  };

  const filteredMovimentacoes = movimentacoes.filter(mov => {
    const cliente = clientes.find(c => c.id === mov.cliente_id);
    
    // Filtro por empresa (MASTER vê tudo ou filtra por uma, COBRADOR vê apenas a selecionada)
    if (appUser?.role === 'COBRADOR') {
      if (mov.empresaId !== selectedEmpresa?.id && cliente?.empresaId !== selectedEmpresa?.id) return false;
    } else {
      if (filtros.empresa_id && mov.empresaId !== filtros.empresa_id) return false;
    }

    if (filtros.cliente_id && mov.cliente_id !== filtros.cliente_id) return false;
    if (filtros.cliente_search) {
      const search = filtros.cliente_search.toLowerCase();
      const clienteNome = cliente?.nome.toLowerCase() || '';
      const clienteCodigo = (cliente as any)?.codigo?.toLowerCase() || '';
      if (!clienteNome.includes(search) && !clienteCodigo.includes(search)) return false;
    }
    if (filtros.cobrador_id && mov.cobrador_id !== filtros.cobrador_id) return false;
    if (filtros.status && mov.tipo !== filtros.status) return false;
    
    if (filtros.dataInicio) {
      if (new Date(mov.data) < new Date(filtros.dataInicio)) return false;
    }
    if (filtros.dataFim) {
      const dataFim = new Date(filtros.dataFim);
      dataFim.setHours(23, 59, 59, 999);
      if (new Date(mov.data) > dataFim) return false;
    }
    
    // Se for cobrador, só vê as próprias
    if (appUser?.role === 'COBRADOR' && mov.cobrador_id !== appUser.id) return false;

    // Apenas pagamentos e estornos geram comissão (positiva ou negativa)
    if (mov.tipo !== 'PAGAMENTO' && mov.tipo !== 'ESTORNO') return false;

    return true;
  });

  const getClienteNome = (id: string) => clientes.find(c => c.id === id)?.nome || 'Desconhecido';
  const getEmpresaNome = (cliente_id: string) => {
    const cliente = clientes.find(c => c.id === cliente_id);
    if (!cliente) return 'Desconhecida';
    return empresas.find(e => e.id === cliente.empresaId)?.nome || 'Desconhecida';
  };
  const getCobradorNome = (id: string) => cobradores.find(c => c.id === id)?.nome || 'Desconhecido';
  
  const calcularComissao = (mov: Movimentacao) => {
    const cobrador = cobradores.find(c => c.id === mov.cobrador_id);
    if (!cobrador || !cobrador.comissao_percentual) return 0;
    
    let valorBase = mov.valor;
    if (mov.tipo === 'ESTORNO') {
      valorBase = -mov.valor;
    }
    
    return valorBase * (cobrador.comissao_percentual / 100);
  };

  const totalComissao = filteredMovimentacoes.reduce((acc, mov) => acc + calcularComissao(mov), 0);
  const totalRecebido = filteredMovimentacoes.reduce((acc, mov) => mov.tipo === 'PAGAMENTO' ? acc + mov.valor : acc - mov.valor, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Relatórios Financeiros</h1>
          <p className="mt-1 text-sm text-gray-500">Relatório de recebimentos e comissões.</p>
        </div>
        <Button variant="secondary" onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-2" />
          Imprimir
        </Button>
      </div>

      <Card className="print:hidden">
        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label>
            <input
              type="date"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
              value={filtros.dataInicio}
              onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label>
            <input
              type="date"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
              value={filtros.dataFim}
              onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente (Nome/Código)</label>
            <input
              type="text"
              placeholder="Buscar por nome ou código..."
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
              value={filtros.cliente_search}
              onChange={(e) => setFiltros({ ...filtros, cliente_search: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente (Lista)</label>
            <select
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
              value={filtros.cliente_id}
              onChange={(e) => setFiltros({ ...filtros, cliente_id: e.target.value })}
            >
              <option value="">Todos</option>
              {clientes
                .filter(c => appUser?.role === 'MASTER' || c.empresaId === selectedEmpresa?.id)
                .map(c => <option key={c.id} value={c.id}>{c.nome}</option>)
              }
            </select>
          </div>
          {appUser?.role === 'MASTER' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                <select
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  value={filtros.empresa_id}
                  onChange={(e) => setFiltros({ ...filtros, empresa_id: e.target.value })}
                >
                  <option value="">Todas</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cobrador</label>
                <select
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  value={filtros.cobrador_id}
                  onChange={(e) => setFiltros({ ...filtros, cobrador_id: e.target.value })}
                >
                  <option value="">Todos</option>
                  {cobradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status/Tipo</label>
                <select
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  value={filtros.status}
                  onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
                >
                  <option value="">Todos</option>
                  <option value="PAGAMENTO">Pagamento</option>
                  <option value="ESTORNO">Estorno</option>
                  <option value="NEGOCIACAO">Negociação</option>
                  <option value="AJUSTE">Ajuste</option>
                </select>
              </div>
            </>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900">Total Efetivamente Recebido</h3>
            <p className="mt-2 text-3xl font-bold text-green-600">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRecebido)}
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900">Total de Comissões</h3>
            <p className="mt-2 text-3xl font-bold text-blue-600">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalComissao)}
            </p>
          </div>
        </Card>
      </div>

      <Card className="print:shadow-none print:border-none">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 print:bg-white">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente/Empresa</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Recebido</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comissão</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cobrador</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMovimentacoes.map((mov) => (
                <tr key={mov.id} className={mov.tipo === 'ESTORNO' ? 'bg-red-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(mov.data).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{getClienteNome(mov.cliente_id)}</div>
                    <div className="text-sm text-gray-500">{getEmpresaNome(mov.cliente_id)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${mov.tipo === 'ESTORNO' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      {mov.tipo}
                    </span>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${mov.tipo === 'ESTORNO' ? 'text-red-600' : 'text-gray-900'}`}>
                    {mov.tipo === 'ESTORNO' ? '-' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mov.valor)}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${mov.tipo === 'ESTORNO' ? 'text-red-600' : 'text-blue-600'}`}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calcularComissao(mov))}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getCobradorNome(mov.cobrador_id)}
                  </td>
                </tr>
              ))}
              {filteredMovimentacoes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                    Nenhum registro encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
