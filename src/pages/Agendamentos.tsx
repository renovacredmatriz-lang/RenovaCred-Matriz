import React, { useState, useEffect } from 'react';
import { useAuth, OperationType } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, deleteDoc, where, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, CheckCircle, Printer, X, Trash2, Send, Loader2, CalendarClock } from 'lucide-react';
import { logAction } from '../utils/auditLogger';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getAgendamentoStatusLogico, normalizeDate } from '../utils/agendamentoUtils';

interface Agendamento {
  id: string;
  cliente_id: string;
  cobrador_id: string;
  empresaId: string;
  uid?: string;
  data_agendamento: string;
  observacoes: string;
  status: 'PENDENTE' | 'CONCLUIDO' | 'REAGENDADO';
  createdAt: string;
  tentativa?: number;
}

interface Cliente {
  id: string;
  nome: string;
  empresaId: string;
  codigo?: string;
  endereco?: string;
  telefone1?: string;
  telefone2?: string;
}

export default function Agendamentos() {
  const { appUser, currentUser, handlePermissionError } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReagendarModalOpen, setIsReagendarModalOpen] = useState(false);
  const [selectedAgendamento, setSelectedAgendamento] = useState<Agendamento | null>(null);
  
  const [filtros, setFiltros] = useState({ busca: '', dataInicio: '', dataFim: '' });
  const [buscaClienteModal, setBuscaClienteModal] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  const [formData, setFormData] = useState({
    cliente_id: '',
    data_agendamento: '',
    observacoes: ''
  });

  const [reagendarData, setReagendarData] = useState({
    data_agendamento: '',
    observacoes: ''
  });

  const handleGerarRelatorioDiario = async () => {
    if (!selectedEmpresa) {
      alert("Nenhuma empresa selecionada.");
      return;
    }

    if (!window.confirm("Deseja gerar o relatório de agendamentos realizados no dia de hoje e enviar via Whatsapp?")) {
      return;
    }

    setIsGeneratingReport(true);

    try {
      // 1. Obter telefone da empresa
      const empresaDoc = await getDoc(doc(db, 'empresas', selectedEmpresa.id));
      if (!empresaDoc.exists()) {
        alert("Empresa não encontrada no banco de dados.");
        setIsGeneratingReport(false);
        return;
      }
      
      const empresaData = empresaDoc.data();
      const telefoneDestino = empresaData.telefone1?.replace(/\D/g, ''); // Limpar pontuação

      if (!telefoneDestino) {
        alert("A empresa selecionada não possui 'Telefone 1' cadastrado. Atualize o cadastro da empresa no painel administrativo.");
        setIsGeneratingReport(false);
        return;
      }

      // 2. Filtrar agendamentos *CRIADOS* hoje
      const hojeStr = new Date().toDateString();
      const agendamentosDeHoje = agendamentos.filter(ag => {
        if (!ag.createdAt) return false;
        return new Date(ag.createdAt).toDateString() === hojeStr;
      });

      if (agendamentosDeHoje.length === 0) {
        alert("Nenhum agendamento foi lançado na data de hoje para esta empresa.");
        setIsGeneratingReport(false);
        return;
      }

      // 3. Preparar e gerar PDF
      const docPdf = new jsPDF();
      
      // Cabeçalho
      docPdf.setFontSize(16);
      docPdf.text('RELATÓRIO DE AGENDAMENTOS DO DIA', 14, 22);
      
      docPdf.setFontSize(10);
      docPdf.setTextColor(100);
      docPdf.text(`Empresa: ${selectedEmpresa.nomeFantasia || selectedEmpresa.nome}`, 14, 30);
      docPdf.text(`Data de Geração: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 36);

      // Tabela
      const tableColumn = ["CLIENTE", "TELEFONE", "DATA AGEND.", "STATUS", "OBSERVAÇÕES"];
      const tableRows: string[][] = [];

      agendamentosDeHoje.forEach(ag => {
        const cliente = getCliente(ag.cliente_id);
        const nomeCliente = cliente ? (cliente.codigo ? `${cliente.codigo} - ${cliente.nome}` : cliente.nome) : 'Desconhecido';
        
        const telefone = cliente ? (cliente.telefone1 || cliente.telefone2 || "Não informado") : "Não informado";
        
        const agDate = normalizeDate(ag.data_agendamento);
        const dataAgend = agDate ? agDate.toLocaleDateString('pt-BR') : 'Data Inválida';

        const statusLogico = getAgendamentoStatusLogico(ag.status, ag.data_agendamento);
        const statusExibicao = (statusLogico || '').toUpperCase();
        
        tableRows.push([
          nomeCliente,
          telefone,
          dataAgend,
          statusExibicao,
          ag.observacoes || 'Nenhuma'
        ]);
      });

      autoTable(docPdf, {
        head: [tableColumn],
        body: tableRows,
        startY: 44,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [41, 128, 185] }
      });

      // Salvar (download) PDF
      const fileName = `Relatorio_Agend_Realizados_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
      docPdf.save(fileName);

      // 4. Redirecionar WhatsApp
      const mensagem = "Segue o relatório de agendamentos realizados hoje para acompanhamento das cobranças.";
      const linkWa = `https://wa.me/55${telefoneDestino}?text=${encodeURIComponent(mensagem)}`;
      
      // Pequeno timeout para dar sensação do download iniciar
      setTimeout(() => {
        window.open(linkWa, '_blank');
      }, 500);

    } catch (error) {
      console.error("Erro ao gerar relatório:", error);
      alert("Ocorreu um erro ao gerar o relatório ou buscar contato da empresa.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  useEffect(() => {
    let qClientes;
    if (appUser?.role === 'MASTER') {
      qClientes = query(collection(db, 'clientes'), orderBy('nome'));
    } else {
      if (!selectedEmpresa) return;
      qClientes = query(collection(db, 'clientes'), where('empresaId', '==', selectedEmpresa.id), orderBy('nome'));
    }
    const unsubClientes = onSnapshot(qClientes, (snapshot) => {
      const validClientes = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Cliente))
        .filter(c => c.empresaId);
      setClientes(validClientes);
    });
    
    let qAgendamentos;
    if (appUser?.role === 'MASTER') {
      qAgendamentos = query(collection(db, 'agendamentos'), orderBy('data_agendamento', 'asc'));
    } else {
      if (!selectedEmpresa) return;
      qAgendamentos = query(collection(db, 'agendamentos'), where('empresaId', '==', selectedEmpresa.id), orderBy('data_agendamento', 'asc'));
    }
    const unsubAgendamentos = onSnapshot(qAgendamentos, (snapshot) => {
      const validAgendamentos = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Agendamento))
        .filter(a => a.empresaId);
      setAgendamentos(validAgendamentos);
    }, (error) => {
      handlePermissionError(error, OperationType.LIST, 'agendamentos');
    });

    return () => {
      unsubClientes();
      unsubAgendamentos();
    };
  }, [selectedEmpresa]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;
    if (!selectedEmpresa?.id) return;
    if (!currentUser?.uid) return;

    const cobradorIdResolvido = selectedEmpresa?.cobradorId;
    if (!cobradorIdResolvido) {
      throw new Error("Empresa sem cobrador vinculado.");
    }

    const cliente = clientes.find(c => c.id === formData.cliente_id);
    if (!cliente) return;

    try {
      const docRef = await addDoc(collection(db, 'agendamentos'), {
        cliente_id: cliente.id,
        empresaId: selectedEmpresa.id,
        cobrador_id: cobradorIdResolvido,
        uid: currentUser.uid,
        data_agendamento: new Date(formData.data_agendamento).toISOString(),
        observacoes: formData.observacoes,
        status: 'PENDENTE',
        createdAt: new Date().toISOString(),
        tentativa: 1
      });
      logAction(appUser, 'CRIAR_AGENDAMENTO', 'agendamento', docRef.id, formData);
      setIsModalOpen(false);
      setFormData({ cliente_id: '', data_agendamento: '', observacoes: '' });
    } catch (error) {
      console.error("Error saving agendamento:", error);
      alert("Erro ao salvar agendamento.");
    }
  };

  const handleConcluir = async (agendamento: Agendamento) => {
    if (!currentUser?.uid) return;
    if (!selectedEmpresa?.id) return;
    if (!appUser) return;

    if (!window.confirm("Deseja realmente dar como concluído este agendamento?")) {
      return;
    }

    try {
      await updateDoc(doc(db, 'agendamentos', agendamento.id), { 
        status: 'CONCLUIDO',
        uid: currentUser?.uid || appUser.id,
        empresaId: selectedEmpresa.id
      });

      logAction(appUser, 'CONCLUIR_AGENDAMENTO', 'agendamento', agendamento.id, {});
    } catch (error) {
      console.error("Error updating agendamento:", error);
      handlePermissionError(error, OperationType.WRITE, 'agendamentos');
    }
  };

  const handleReagendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgendamento || !currentUser?.uid || !selectedEmpresa?.id || !appUser) return;

    const cobradorIdResolvido = selectedEmpresa?.cobradorId;
    if (!cobradorIdResolvido) {
      throw new Error("Empresa sem cobrador vinculado.");
    }

    try {
      // 1. Criar o NOVO agendamento
      const novoDocRef = await addDoc(collection(db, 'agendamentos'), {
        cliente_id: selectedAgendamento.cliente_id,
        empresaId: selectedEmpresa.id,
        cobrador_id: cobradorIdResolvido,
        uid: currentUser.uid,
        data_agendamento: new Date(reagendarData.data_agendamento).toISOString(),
        observacoes: reagendarData.observacoes,
        status: 'PENDENTE',
        createdAt: new Date().toISOString(),
        tentativa: (selectedAgendamento.tentativa || 1) + 1
      });

      // 2. Atualizar o agendamento ANTIGO para REAGENDADO
      await updateDoc(doc(db, 'agendamentos', selectedAgendamento.id), {
        status: 'REAGENDADO'
      });

      logAction(appUser, 'REAGEND_AGENDAMENTO', 'agendamento', selectedAgendamento.id, { novoId: novoDocRef.id });
      setIsReagendarModalOpen(false);
      setSelectedAgendamento(null);
      setReagendarData({ data_agendamento: '', observacoes: '' });
      alert("Novo agendamento criado com sucesso!");
    } catch (error) {
      console.error("Error rescheduling:", error);
      alert("Erro ao reagendar.");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getClienteNome = (id: string) => clientes.find(c => c.id === id)?.nome || 'Desconhecido';
  const getCliente = (id: string) => clientes.find(c => c.id === id);

  const agendamentosFiltrados = agendamentos.filter(a => {
    const cliente = getCliente(a.cliente_id);
    const termo = filtros.busca.toLowerCase();
    const matchBusca = termo === '' || 
      cliente?.nome.toLowerCase().includes(termo) || 
      (cliente?.codigo && cliente.codigo.toLowerCase().includes(termo));
    
    let matchData = true;
    if (filtros.dataInicio) {
      matchData = matchData && new Date(a.data_agendamento) >= new Date(filtros.dataInicio + 'T00:00:00');
    }
    if (filtros.dataFim) {
      matchData = matchData && new Date(a.data_agendamento) <= new Date(filtros.dataFim + 'T23:59:59');
    }
    
    return matchBusca && matchData;
  });

  const sortedAgendamentos = [...agendamentosFiltrados].sort((a, b) => {
    if (a.status === 'PENDENTE' && b.status === 'CONCLUIDO') return -1;
    if (a.status === 'CONCLUIDO' && b.status === 'PENDENTE') return 1;
    return 0;
  });

  const agendamentosParaImpressao = agendamentos.filter(a => {
    const statusLogico = getAgendamentoStatusLogico(a.status, a.data_agendamento);
    return statusLogico === 'PENDENTE' || statusLogico === 'HOJE' || statusLogico === 'VENCIDO';
  }).sort((a, b) => new Date(a.data_agendamento).getTime() - new Date(b.data_agendamento).getTime());

  const clientesFiltradosModal = clientes.filter(c => {
    const termo = buscaClienteModal.toLowerCase();
    return termo === '' || c.nome.toLowerCase().includes(termo) || (c.codigo && c.codigo.toLowerCase().includes(termo));
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Agendamentos</h1>
          <p className="mt-1 text-sm text-gray-500">Controle de retornos e contatos.</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="secondary" onClick={handleGerarRelatorioDiario} disabled={isGeneratingReport || !selectedEmpresa}>
            {isGeneratingReport ? (
               <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
               <Send className="w-4 h-4 mr-2 text-green-600" />
            )}
            Lançamentos de Hoje (PDF + WhatsApp)
          </Button>
          <Button variant="secondary" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
          {appUser?.role !== 'MASTER' && (
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Agendamento
            </Button>
          )}
        </div>
      </div>

      <div className="print:hidden">
        <Card className="mb-6">
          <div className="p-4 flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                label="Buscar Cliente (Nome ou Código)"
                value={filtros.busca}
                onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
                placeholder="Digite nome ou código..."
              />
            </div>
            <div>
              <Input
                label="Data Inicial"
                type="date"
                value={filtros.dataInicio}
                onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })}
              />
            </div>
            <div>
              <Input
                label="Data Final"
                type="date"
                value={filtros.dataFim}
                onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })}
              />
            </div>
          </div>
        </Card>

        <Card className="print:shadow-none print:border-none">
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 print:bg-white">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data/Hora</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Observações</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedAgendamentos.map((agendamento) => {
                const statusLogico = getAgendamentoStatusLogico(agendamento.status, agendamento.data_agendamento);
                const isVencido = statusLogico === 'VENCIDO';
                const isHoje = statusLogico === 'HOJE';
                const statusExibicao = statusLogico;
                const statusColor = statusLogico === 'REAGENDADO' ? 'bg-blue-100 text-blue-800' :
                                    (isVencido ? 'bg-red-100 text-red-800' : 
                                    (isHoje ? 'bg-yellow-100 text-yellow-800' :
                                    (statusLogico === 'CONCLUIDO' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800')));

                return (
                  <tr key={agendamento.id} className={(agendamento.status === 'CONCLUIDO' || agendamento.status === 'REAGENDADO') ? 'bg-gray-50 opacity-60' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 border-l-4" style={{ borderColor: isVencido ? '#ef4444' : (isHoje ? '#eab308' : (agendamento.status === 'CONCLUIDO' ? '#22c55e' : (agendamento.status === 'REAGENDADO' ? '#3b82f6' : '#3b82f6'))) }}>
                      {new Date(agendamento.data_agendamento).toLocaleString('pt-BR')}
                      <div className="text-[10px] text-gray-400 font-bold mt-1 uppercase">
                        {agendamento.tentativa || 1}ª Tentativa
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {getClienteNome(agendamento.cliente_id)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {agendamento.observacoes}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}`}>
                        {statusExibicao}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium print:hidden">
                      <div className="flex justify-end space-x-2">
                        {appUser?.role !== 'MASTER' && agendamento.status === 'PENDENTE' && (
                          <>
                            <button 
                              onClick={() => {
                                if (window.confirm("Deseja realmente realizar um novo agendamento?")) {
                                  setSelectedAgendamento(agendamento);
                                  setIsReagendarModalOpen(true);
                                }
                              }}
                              className="text-blue-600 hover:text-blue-900 flex items-center"
                              title="Reagendar"
                            >
                              <CalendarClock className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => handleConcluir(agendamento)}
                              className="text-green-600 hover:text-green-900 flex items-center"
                              title="Concluir"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedAgendamentos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    Nenhum agendamento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </Card>
      </div>

      {/* Print Layout */}
      <div className="hidden print:block">
        <h2 className="text-2xl font-bold mb-6 text-center border-b pb-4">Relatório de Agendamentos (Pendentes até Hoje)</h2>
        {agendamentosParaImpressao.length === 0 ? (
          <p className="text-center text-gray-500 mt-10">Nenhum agendamento pendente para hoje ou datas anteriores.</p>
        ) : (
          <div className="space-y-6">
            {agendamentosParaImpressao.map(a => {
              const cliente = getCliente(a.cliente_id);
              return (
                <div key={a.id} className="border border-gray-300 rounded-lg p-4 break-inside-avoid">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Cliente</p>
                      <p className="font-bold text-lg">{cliente?.codigo ? `${cliente.codigo} - ` : ''}{cliente?.nome || 'Desconhecido'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Data/Hora</p>
                      <p className="font-bold text-lg">{new Date(a.data_agendamento).toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-gray-400 font-bold mt-1 uppercase">{a.tentativa || 1}ª Tentativa</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Endereço</p>
                      <p>{cliente?.endereco || 'Não informado'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Telefones</p>
                      <p>
                        {cliente?.telefone1 || 'Não informado'} 
                        {cliente?.telefone2 ? ` / ${cliente.telefone2}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Observações</p>
                    <p className="whitespace-pre-wrap">{a.observacoes || 'Nenhuma observação.'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-medium text-gray-900">Novo Agendamento</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Buscar Cliente (Nome ou Código)</label>
                  <input
                    type="text"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border mb-3"
                    placeholder="Digite para filtrar a lista abaixo..."
                    value={buscaClienteModal}
                    onChange={(e) => setBuscaClienteModal(e.target.value)}
                  />
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliente Selecionado</label>
                  <select
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={formData.cliente_id}
                    onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
                    required
                  >
                    <option value="">Selecione um cliente</option>
                    {clientesFiltradosModal.map(c => (
                      <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nome}</option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Data e Hora"
                  type="datetime-local"
                  value={formData.data_agendamento}
                  onChange={(e) => setFormData({ ...formData, data_agendamento: e.target.value })}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                  <textarea
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    rows={3}
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    required
                  />
                </div>

                <div className="pt-4 flex justify-end space-x-3 border-t border-gray-200 mt-6 shrink-0">
                  <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    Salvar
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reagendamento */}
      {isReagendarModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-medium text-gray-900">Reagendar Contato</h3>
              <button 
                onClick={() => {
                  setIsReagendarModalOpen(false);
                  setSelectedAgendamento(null);
                }} 
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-xs text-blue-700 font-bold uppercase mb-1">Cliente</p>
                <p className="text-sm font-medium text-blue-900">{getClienteNome(selectedAgendamento?.cliente_id || '')}</p>
                <p className="text-[10px] text-blue-600 font-bold mt-2 uppercase">Próxima Tentativa: {(selectedAgendamento?.tentativa || 1) + 1}ª</p>
              </div>

              <form onSubmit={handleReagendar} className="space-y-4">
                <Input
                  label="Nova Data e Hora"
                  type="datetime-local"
                  value={reagendarData.data_agendamento}
                  onChange={(e) => setReagendarData({ ...reagendarData, data_agendamento: e.target.value })}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Novas Observações</label>
                  <textarea
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    rows={3}
                    value={reagendarData.observacoes}
                    onChange={(e) => setReagendarData({ ...reagendarData, observacoes: e.target.value })}
                    required
                    placeholder="Descreva o motivo do reagendamento..."
                  />
                </div>

                <div className="pt-4 flex justify-end space-x-3 border-t border-gray-200 mt-6 shrink-0">
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => {
                      setIsReagendarModalOpen(false);
                      setSelectedAgendamento(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">
                    Confirmar Reagendamento
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reagendamento */}
      {isReagendarModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-medium text-gray-900">Reagendar Contato</h3>
              <button 
                onClick={() => {
                  setIsReagendarModalOpen(false);
                  setSelectedAgendamento(null);
                }} 
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-xs text-blue-700 font-bold uppercase mb-1">Cliente</p>
                <p className="text-sm font-medium text-blue-900">{getClienteNome(selectedAgendamento?.cliente_id || '')}</p>
                <p className="text-[10px] text-blue-600 font-bold mt-2 uppercase">Próxima Tentativa: {(selectedAgendamento?.tentativa || 1) + 1}ª</p>
              </div>

              <form onSubmit={handleReagendar} className="space-y-4">
                <Input
                  label="Nova Data e Hora"
                  type="datetime-local"
                  value={reagendarData.data_agendamento}
                  onChange={(e) => setReagendarData({ ...reagendarData, data_agendamento: e.target.value })}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Novas Observações</label>
                  <textarea
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    rows={3}
                    value={reagendarData.observacoes}
                    onChange={(e) => setReagendarData({ ...reagendarData, observacoes: e.target.value })}
                    required
                    placeholder="Descreva o motivo do reagendamento..."
                  />
                </div>

                <div className="pt-4 flex justify-end space-x-3 border-t border-gray-200 mt-6 shrink-0">
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => {
                      setIsReagendarModalOpen(false);
                      setSelectedAgendamento(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">
                    Confirmar Reagendamento
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reagendamento */}
      {isReagendarModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-medium text-gray-900">Reagendar Contato</h3>
              <button 
                onClick={() => {
                  setIsReagendarModalOpen(false);
                  setSelectedAgendamento(null);
                }} 
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-xs text-blue-700 font-bold uppercase mb-1">Cliente</p>
                <p className="text-sm font-medium text-blue-900">{getClienteNome(selectedAgendamento?.cliente_id || '')}</p>
                <p className="text-[10px] text-blue-600 font-bold mt-2 uppercase">Próxima Tentativa: {(selectedAgendamento?.tentativa || 1) + 1}ª</p>
              </div>

              <form onSubmit={handleReagendar} className="space-y-4">
                <Input
                  label="Nova Data e Hora"
                  type="datetime-local"
                  value={reagendarData.data_agendamento}
                  onChange={(e) => setReagendarData({ ...reagendarData, data_agendamento: e.target.value })}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Novas Observações</label>
                  <textarea
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    rows={3}
                    value={reagendarData.observacoes}
                    onChange={(e) => setReagendarData({ ...reagendarData, observacoes: e.target.value })}
                    required
                    placeholder="Descreva o motivo do reagendamento..."
                  />
                </div>

                <div className="pt-4 flex justify-end space-x-3 border-t border-gray-200 mt-6 shrink-0">
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => {
                      setIsReagendarModalOpen(false);
                      setSelectedAgendamento(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">
                    Confirmar Reagendamento
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reagendamento */}
      {isReagendarModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-medium text-gray-900">Reagendar Contato</h3>
              <button 
                onClick={() => {
                  setIsReagendarModalOpen(false);
                  setSelectedAgendamento(null);
                }} 
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-xs text-blue-700 font-bold uppercase mb-1">Cliente</p>
                <p className="text-sm font-medium text-blue-900">{getClienteNome(selectedAgendamento?.cliente_id || '')}</p>
                <p className="text-[10px] text-blue-600 font-bold mt-2 uppercase">Próxima Tentativa: {(selectedAgendamento?.tentativa || 1) + 1}ª</p>
              </div>

              <form onSubmit={handleReagendar} className="space-y-4">
                <Input
                  label="Nova Data e Hora"
                  type="datetime-local"
                  value={reagendarData.data_agendamento}
                  onChange={(e) => setReagendarData({ ...reagendarData, data_agendamento: e.target.value })}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Novas Observações</label>
                  <textarea
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    rows={3}
                    value={reagendarData.observacoes}
                    onChange={(e) => setReagendarData({ ...reagendarData, observacoes: e.target.value })}
                    required
                    placeholder="Descreva o motivo do reagendamento..."
                  />
                </div>

                <div className="pt-4 flex justify-end space-x-3 border-t border-gray-200 mt-6 shrink-0">
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => {
                      setIsReagendarModalOpen(false);
                      setSelectedAgendamento(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">
                    Confirmar Reagendamento
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
