import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, OperationType } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
import { collection, onSnapshot, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { MessageCircle, Search, Calendar, History, Send, CheckSquare, Square, PhoneOff, AlertCircle, Building2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { normalizeDate, getAgendamentoStatusLogico } from '../utils/agendamentoUtils';

interface Cliente {
  id: string;
  codigo: string;
  nome: string;
  telefone1: string;
  telefone2?: string;
  empresaId: string;
  valor_debito?: number;
  numeroTitulos?: string;
}

interface Agendamento {
  id: string;
  cliente_id: string;
  data_agendamento: string;
  status: 'PENDENTE' | 'CONCLUIDO';
}

interface Empresa {
  id: string;
  nome: string;
  nomeFantasia?: string;
}

const TEMPLATES = [
  { id: 1, label: 'Lembrete vencendo hoje', text: 'Olá, [NOME]!\nAqui é da RenovaCred, referente à [EMPRESA].\nPassando para lembrar que seu pagamento vence hoje.\nCaso já tenha realizado, desconsidere.\nSe precisar, estamos à disposição.' },
  { id: 2, label: 'Parcela vencida', text: 'Olá, [NOME].\nAqui é da RenovaCred, cobrando em nome da [EMPRESA].\nIdentificamos um pagamento em atraso.\nPodemos te ajudar a regularizar?' },
  { id: 3, label: 'Cobrança inicial', text: 'Olá, [NOME]!\nAqui é da RenovaCred, representando a [EMPRESA].\nEstamos entrando em contato para tratar de uma pendência financeira.\nFale conosco para regularizar.' },
  { id: 4, label: 'Cobrança amigável', text: 'Olá, [NOME]!\nAqui é da RenovaCred.\nQueremos te ajudar a resolver sua pendência com a [EMPRESA] da melhor forma possível.' },
  { id: 5, label: 'Proposta de acordo', text: 'Olá, [NOME].\nTemos condições especiais para regularizar sua situação com a [EMPRESA].\nPodemos conversar?' },
  { id: 6, label: 'Último lembrete', text: 'Olá, [NOME].\nEste é um último lembrete sobre sua pendência com a [EMPRESA].\nEvite restrições — entre em contato.' },
  { id: 7, label: 'Confirmação de contato', text: 'Olá, [NOME]!\nAqui é da RenovaCred.\nEstamos tentando contato sobre sua situação com a [EMPRESA].' },
  { id: 8, label: 'Aviso de atraso prolongado', text: 'Olá, [NOME].\nIdentificamos atraso prolongado com a [EMPRESA].\nPrecisamos tratar com urgência.' },
  { id: 9, label: 'Lembrete com valor', text: 'Olá, [NOME]!\nSua pendência com a [EMPRESA] é de aproximadamente R$ [VALOR].\nPodemos negociar?' },
  { id: 10, label: 'Mensagem neutra', text: 'Olá, [NOME].\nAqui é da RenovaCred, referente à [EMPRESA].\nPor favor, entre em contato conosco.' },
  { id: 11, label: 'Notificação extrajudicial', text: 'Olá, [NOME].\n\nIdentificamos pendências em aberto junto à [EMPRESA].\n\nCaso não haja regularização ou retorno em breve, poderá ser emitida uma Notificação Extrajudicial para formalização da cobrança.\n\nEntre em contato para evitarmos medidas adicionais.' },
  { id: 12, label: 'Aviso SPC/Serasa', text: 'Olá, [NOME].\n\nSua pendência junto à [EMPRESA] continua em aberto.\n\nA ausência de regularização poderá resultar no encaminhamento do débito aos órgãos de proteção ao crédito, como SPC e Serasa, conforme previsto contratualmente.\n\nEntre em contato para negociação.' }
];

export default function MensagensAuto() {
  const { appUser, handlePermissionError } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'TUDO' | 'HOJE' | 'VENCIDOS'>('TUDO');
  const [selectedClienteIds, setSelectedClienteIds] = useState<Set<string>>(new Set());
  const [selectedTemplateId, setSelectedTemplateId] = useState(1);
  const [messageText, setMessageText] = useState(TEMPLATES[0].text);
  const [customValue, setCustomValue] = useState('');
  
  const [isSending, setIsSending] = useState(false);
  const [sendingQueue, setSendingQueue] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Update messageText when selectedTemplateId changes
  useEffect(() => {
    const template = TEMPLATES.find(t => t.id === selectedTemplateId);
    if (template) {
      setMessageText(template.text);
    }
  }, [selectedTemplateId]);

  useEffect(() => {
    if (appUser?.role !== 'COBRADOR' || !selectedEmpresa) return;

    // Fetch Clientes
    const qClientes = query(
      collection(db, 'clientes'),
      where('empresaId', '==', selectedEmpresa.id)
    );
    const unsubClientes = onSnapshot(qClientes, (snapshot) => {
      setClientes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cliente)));
    }, (error) => handlePermissionError(error, OperationType.LIST, 'clientes'));

    // Fetch Agendamentos
    const qAgendamentos = query(
      collection(db, 'agendamentos'),
      where('empresaId', '==', selectedEmpresa.id),
      where('cobrador_id', '==', appUser.id)
    );
    const unsubAgendamentos = onSnapshot(qAgendamentos, (snapshot) => {
      setAgendamentos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Agendamento)));
    }, (error) => handlePermissionError(error, OperationType.LIST, 'agendamentos'));

    // Fetch Empresas (to get names for [EMPRESA])
    let qEmpresas = query(collection(db, 'empresas'));
    if (appUser.role === 'COBRADOR') {
      qEmpresas = query(collection(db, 'empresas'), where('cobradorId', '==', appUser.uid));
    }
    const unsubEmpresas = onSnapshot(qEmpresas, (snapshot) => {
      setEmpresas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Empresa)));
    }, (error) => handlePermissionError(error, OperationType.LIST, 'empresas'));

    return () => {
      unsubClientes();
      unsubAgendamentos();
      unsubEmpresas();
    };
  }, [appUser, selectedEmpresa, handlePermissionError]);

  const filteredClientes = useMemo(() => {
    const prioridadeStatus: Record<string, number> = {
      'VENCIDO': 1,
      'HOJE': 2,
      'PENDENTE': 3
    };

    const clientePrioridadeMap: Record<string, number> = {};

    agendamentos.forEach(a => {
      const statusLogico = getAgendamentoStatusLogico(a.status, a.data_agendamento);
      const cId = a.cliente_id || (a as any).clienteId;
      const p = prioridadeStatus[statusLogico as keyof typeof prioridadeStatus] ?? 99;

      if (!(cId in clientePrioridadeMap) || p < clientePrioridadeMap[cId]) {
        clientePrioridadeMap[cId] = p;
      }
    });

    const agFiltrados = agendamentos.filter(a => {
      const statusLogico = getAgendamentoStatusLogico(a.status, a.data_agendamento);

      if (filterType === 'HOJE') {
        return statusLogico === 'HOJE';
      }

      if (filterType === 'VENCIDOS') {
        return statusLogico === 'VENCIDO';
      }

      if (filterType === 'TUDO') {
        return statusLogico === 'HOJE' || statusLogico === 'VENCIDO';
      }

      return false;
    });

    const clienteIds = Array.from(new Set(agFiltrados.map(a => a.cliente_id || (a as any).clienteId)));
    let baseList = clientes.filter(c => clienteIds.includes(c.id));

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      baseList = baseList.filter(c => 
        c.nome.toLowerCase().includes(lower) || 
        c.codigo.toLowerCase().includes(lower)
      );
    }

    return baseList.sort((a, b) => {
      const pA = clientePrioridadeMap[a.id] ?? 99;
      const pB = clientePrioridadeMap[b.id] ?? 99;

      if (pA !== pB) {
        return pA - pB;
      }
      return a.nome.localeCompare(b.nome);
    });
  }, [clientes, agendamentos, filterType, searchTerm]);

  const toggleSelectAll = () => {
    if (selectedClienteIds.size === filteredClientes.filter(c => c.telefone1 || c.telefone2).length) {
      setSelectedClienteIds(new Set());
    } else {
      const allWithPhone = filteredClientes
        .filter(c => c.telefone1 || c.telefone2)
        .map(c => c.id);
      setSelectedClienteIds(new Set(allWithPhone));
    }
  };

  const toggleSelectCliente = (id: string) => {
    const newSet = new Set(selectedClienteIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedClienteIds(newSet);
  };

  const normalizePhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (!cleaned) return '';
    // Formato: 55 + DDD + número (garante prefixo 55 se não tiver)
    return cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
  };

  const companiesMap = useMemo(() => {
    const map = new Map<string, string>();
    empresas.forEach(e => {
      map.set(e.id, e.nomeFantasia || e.nome);
    });
    return map;
  }, [empresas]);

  const formatMessage = (templateText: string, cliente: Cliente, activeNeg: any[] = [], clientParcelas: any[] = []) => {
    const empresaNome = companiesMap.get(cliente.empresaId) || 'nossa empresa';
    
    let msg = templateText
      .replace(/\[NOME\]/g, cliente.nome)
      .replace(/\[EMPRESA\]/g, empresaNome);

    if (activeNeg.length > 0) {
      // CENÁRIO 2 — CLIENTE COM NEGOCIAÇÃO/PARCELAMENTO ATIVO
      const parcelasOrdenadas = clientParcelas.sort((a,b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime());
      const parcelasPendentes = parcelasOrdenadas.filter(p => p.status === 'PENDENTE');
      const parcelasAtrasadasArray = parcelasOrdenadas.filter(p => p.status === 'ATRASADO');

      const nextParcela = parcelasPendentes[0];
      let diasVencimento = '';
      let valorParcelaStr = '';
      let dataVencimentoStr = '';
      
      if (nextParcela) {
         const diffTime = new Date(nextParcela.data_vencimento).getTime() - new Date().getTime();
         const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
         diasVencimento = diffDays >= 0 ? String(diffDays) : '0';
         valorParcelaStr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(nextParcela.valor || 0);
         dataVencimentoStr = new Date(nextParcela.data_vencimento).toLocaleDateString('pt-BR');
      } else if (parcelasAtrasadasArray.length > 0) {
         const lastAtrasada = parcelasAtrasadasArray[parcelasAtrasadasArray.length - 1];
         valorParcelaStr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lastAtrasada.valor || 0);
      }

      let diasAtrasoStr = '';
      let parcelasAtrasadasList = '';
      if (parcelasAtrasadasArray.length > 0) {
         const firstAtrasada = parcelasAtrasadasArray[0];
         const diffTime = new Date().getTime() - new Date(firstAtrasada.data_vencimento).getTime();
         const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
         diasAtrasoStr = String(diffDays);

         parcelasAtrasadasList = parcelasAtrasadasArray.map(p => {
             const dt = new Date(p.data_vencimento).getTime();
             const daysAtraso = Math.max(0, Math.floor((new Date().getTime() - dt) / (1000 * 60 * 60 * 24)));
             const pVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.valor || 0);
             return `• Parcela ${p.numero_parcela || ''} — ${pVal} — ${daysAtraso} dias em atraso`;
         }).join('\n');
      }

      const numTitulosAtivos = activeNeg.map(n => n.numeroTitulo).filter(Boolean).join(' / ');

      msg = msg.replace(/\[NUMERO_TITULOS\]/g, numTitulosAtivos || '')
               .replace(/\[VALOR_PARCELA\]/g, valorParcelaStr)
               .replace(/\[DIAS_VENCIMENTO\]/g, diasVencimento)
               .replace(/\[DIAS_ATRASO\]/g, diasAtrasoStr)
               .replace(/\[PARCELAS_ATRASADAS\]/g, parcelasAtrasadasList)
               .replace(/\[QTD_PARCELAS\]/g, String(parcelasOrdenadas.length))
               .replace(/\[VENCIMENTO\]/g, dataVencimentoStr);
               
    } else {
      // CENÁRIO 1 — CLIENTE SEM NEGOCIAÇÃO/PARCELAMENTO ATIVO
      const valorDebitoStr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cliente.valor_debito || 0);
      const numTitulos = cliente.numeroTitulos || '';

      msg = msg.replace(/\[NUMERO_TITULOS\]/g, numTitulos)
               .replace(/\[VALOR_PARCELA\]/g, '')
               .replace(/\[DIAS_VENCIMENTO\]/g, '')
               .replace(/\[DIAS_ATRASO\]/g, '')
               .replace(/\[PARCELAS_ATRASADAS\]/g, '')
               .replace(/\[QTD_PARCELAS\]/g, '')
               .replace(/\[VENCIMENTO\]/g, '');

      if (!customValue && msg.includes('[VALOR]')) {
         msg = msg.replace(/\[VALOR\]/g, valorDebitoStr);
      }
    }

    if (customValue) {
      msg = msg.replace(/\[VALOR\]/g, customValue);
    }

    // Retirar espaços duplos na mesma linha mantendo as quebras
    msg = msg.replace(/[ \t]+/g, ' ');

    // Limpeza final para placeholders órfãos
    msg = msg.replace(/\[.*?\]/g, '')
             .replace(/\n\s*\n/g, '\n\n')
             .trim();
    
    return msg;
  };

  const startSending = () => {
    const queue = Array.from(selectedClienteIds);
    if (queue.length === 0) return;
    
    if (queue.length > 50) {
      alert("Limite de 50 mensagens por lote atingido. Por favor, selecione menos clientes.");
      return;
    }

    if (!window.confirm(`Deseja iniciar o envio de ${queue.length} mensagens no WhatsApp?`)) {
      return;
    }

    setSendingQueue(queue);
    setCurrentIndex(0);
    setIsSending(true);
    
    // Process first
    processQueueItem(0, queue);
  };

  const processQueueItem = async (index: number, currentQueue: string[]) => {
    const clienteId = currentQueue[index];
    const cliente = clientes.find(c => c.id === clienteId);
    if (!cliente) return;

    const phone = normalizePhone(cliente.telefone1 || cliente.telefone2 || '');
    if (!phone) {
      console.warn(`Cliente ${cliente.nome} sem telefone válido.`);
      return;
    }

    // Criar a janela imediatamente para reduzir chance de bloqueio de popup
    const newWindow = window.open('', '_blank');

    try {
      // Buscar negociações ATIVAS do cliente
      const qNeg = query(
        collection(db, 'negociacoes'), 
        where('cliente_id', '==', clienteId), 
        where('status', '==', 'ATIVO')
      );
      const snapNeg = await getDocs(qNeg);
      const activeNeg = snapNeg.docs.map(d => ({ id: d.id, ...d.data() }));

      // Buscar parcelas pendentes ou atrasadas
      const qPar = query(
        collection(db, 'parcelas'), 
        where('cliente_id', '==', clienteId), 
        where('status', 'in', ['PENDENTE', 'ATRASADO'])
      );
      const snapPar = await getDocs(qPar);
      const clientParcelas = snapPar.docs.map(d => ({ id: d.id, ...d.data() }));

      const message = formatMessage(messageText, cliente, activeNeg, clientParcelas);
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      
      if (newWindow) {
        newWindow.location.href = url;
      } else {
        window.open(url, '_blank');
      }
    } catch (e) {
      console.error("Erro ao buscar dados do cliente para a mensagem:", e);
      if (newWindow) newWindow.close();
    }
  };

  const nextItem = () => {
    if (currentIndex < sendingQueue.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      processQueueItem(nextIdx, sendingQueue);
    } else {
      finishQueue();
    }
  };

  const skipItem = () => {
    if (currentIndex < sendingQueue.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      processQueueItem(nextIdx, sendingQueue);
    } else {
      finishQueue();
    }
  };

  const finishQueue = () => {
    setIsSending(false);
    setSelectedClienteIds(new Set());
    alert("Sequência de disparos finalizada.");
  };

  if (appUser?.role !== 'COBRADOR') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Cobrança Rápida</h1>
          <p className="mt-1 text-sm text-gray-500">Disparo sequencial de mensagens via WhatsApp.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filtros e Seleção de Clientes */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center">
                <Search className="w-4 h-4 mr-2" />
                Filtrar Clientes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Busca por nome ou código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              
              <div className="space-y-2">
                <button
                  onClick={() => setFilterType('TUDO')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center transition-colors ${filterType === 'TUDO' ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-600'}`}
                >
                  <History className="w-4 h-4 mr-2" />
                  Todos Agendamentos
                </button>
                <button
                  onClick={() => setFilterType('HOJE')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center transition-colors ${filterType === 'HOJE' ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-600'}`}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Agendamentos de Hoje
                </button>
                <button
                  onClick={() => setFilterType('VENCIDOS')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center transition-colors ${filterType === 'VENCIDOS' ? 'bg-red-50 text-red-700 font-medium' : 'hover:bg-gray-100 text-gray-600'}`}
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Agendamentos Vencidos
                </button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center">
                <MessageCircle className="w-4 h-4 mr-2" />
                Configurar Mensagem
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Selecione o Template</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(Number(e.target.value))}
                >
                  {TEMPLATES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              <Input
                label="Valor p/ Placeholder [VALOR]"
                placeholder="Ex: 250,00"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
              />

              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase">Preview do Texto (Editável)</p>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600 focus:ring-blue-500 focus:border-blue-500 min-h-[150px] resize-none"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Edite a mensagem aqui..."
                />
                <p className="text-[10px] text-gray-400 italic">
                  Placeholders disponíveis: [NOME], [EMPRESA], [VALOR], [NUMERO_TITULOS], [VALOR_PARCELA], [DIAS_VENCIMENTO], [DIAS_ATRASO], [PARCELAS_ATRASADAS], [QTD_PARCELAS], [VENCIMENTO]
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Listagem Central */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="flex flex-col h-[700px]">
             <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-white sticky top-0 z-10">
                <div className="flex items-center space-x-4">
                  <button onClick={toggleSelectAll} className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-700">
                    {selectedClienteIds.size > 0 && selectedClienteIds.size === filteredClientes.filter(c => c.telefone1 || c.telefone2).length ? (
                      <CheckSquare className="w-5 h-5 mr-2" />
                    ) : (
                      <Square className="w-5 h-5 mr-2" />
                    )}
                    Selecionar Filtrados
                  </button>
                  <span className="text-sm text-gray-500">
                    <strong>{selectedClienteIds.size}</strong> selecionados (Lote máx. 50)
                  </span>
                </div>
                <Button 
                  onClick={startSending} 
                  disabled={selectedClienteIds.size === 0 || isSending}
                  className="px-8 shadow-md"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Iniciar Disparos
                </Button>
             </div>

             <div className="flex-1 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-6 py-3 text-left w-10"></th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider italic font-serif">Código</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider italic font-serif">Cliente</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider italic font-serif">Empresa</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider italic font-serif text-right">Telefone</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredClientes.map(cliente => {
                      const hasPhone = !!(cliente.telefone1 || cliente.telefone2);
                      const isSelected = selectedClienteIds.has(cliente.id);
                      const empresaNome = empresas.find(e => e.id === cliente.empresaId)?.nomeFantasia || '---';

                      return (
                        <tr 
                          key={cliente.id} 
                          className={`hover:bg-gray-50 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/30' : ''}`}
                          onClick={() => hasPhone && toggleSelectCliente(cliente.id)}
                        >
                          <td className="px-6 py-4">
                            {hasPhone ? (
                              isSelected ? (
                                <CheckSquare className="w-5 h-5 text-blue-600" />
                              ) : (
                                <Square className="w-5 h-5 text-gray-300" />
                              )
                            ) : (
                              <PhoneOff className="w-4 h-4 text-red-300" />
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-400">
                            {cliente.codigo}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-sm font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>{cliente.nome}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center text-xs text-gray-500 font-medium">
                               <Building2 className="w-3 h-3 mr-1 text-gray-400" />
                               {empresaNome}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">
                            {cliente.telefone1 || cliente.telefone2 || <span className="text-red-400 text-xs italic">Sem fone</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
             </div>
          </Card>
        </div>
      </div>

      {/* PAINEL DE CONTROLE DE DISPARO */}
      {isSending && (
        <div className="fixed bottom-8 right-8 z-[60] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Card className="w-80 shadow-2xl border-blue-500 border-2 overflow-visible">
            <div className="absolute -top-3 -left-3 bg-blue-600 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg">
              <MessageCircle className="w-4 h-4" />
            </div>
            <CardContent className="p-6">
               <div className="text-center mb-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Painel de Disparo</p>
                  <h4 className="text-lg font-black text-gray-900">
                    {currentIndex + 1} <span className="text-gray-400">/</span> {sendingQueue.length}
                  </h4>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div 
                      className="bg-blue-600 h-full transition-all duration-300"
                      style={{ width: `${((currentIndex + 1) / sendingQueue.length) * 100}%` }}
                    />
                  </div>
               </div>
               
               <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4">
                  <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">Aguardando Envio para:</p>
                  <p className="text-sm font-bold text-blue-900 truncate">
                    {clientes.find(c => c.id === sendingQueue[currentIndex])?.nome || 'Aguarde...'}
                  </p>
               </div>

               <div className="grid grid-cols-2 gap-3">
                  <Button variant="secondary" onClick={skipItem} className="w-full">
                    Pular
                  </Button>
                  <Button onClick={nextItem} className="w-full">
                    {currentIndex === sendingQueue.length - 1 ? 'Concluir' : 'Próximo'}
                  </Button>
               </div>
               
               <button 
                 onClick={finishQueue} 
                 className="w-full text-center mt-4 text-[10px] font-bold text-red-500 uppercase hover:underline"
               >
                 Cancelar Sequência
               </button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
