import React, { useState, useEffect } from 'react';
import { useAuth, OperationType } from '../contexts/AuthContext';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Printer, MessageCircle, FileText, Building2, Search, User, Receipt, CheckCircle } from 'lucide-react';
import { Navigate } from 'react-router-dom';

interface Empresa {
  id: string;
  nome: string;
  nomeFantasia?: string;
  razaoSocial?: string;
  cnpj?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  telefone1?: string;
  telefone2?: string;
}

interface Cliente {
  id: string;
  codigo: string;
  nome: string;
  cpf?: string;
  valor_debito: number;
  empresaId: string;
}

interface Negociacao {
  id: string;
  cliente_id: string;
  clienteNome?: string;
  numeroTitulo: string;
  tipo: string;
  valor: number;
  valorTotal?: number;
  valorDebito?: number;
  numero_parcelas?: number;
  status: string;
  createdAt: string;
}

interface Movimentacao {
  id: string;
  negociacao_id?: string;
  tipo: string;
  valor: number;
  data: string;
  saldo_anterior: number;
  saldo_atual: number;
  numero_parcela?: number;
}

export default function Recibo() {
  const { appUser, handlePermissionError } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
  
  const [codigoCliente, setCodigoCliente] = useState('');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [negociacoesQuitadas, setNegociacoesQuitadas] = useState<Negociacao[]>([]);
  const [allNegociacoes, setAllNegociacoes] = useState<Negociacao[]>([]);
  const [pagamentosParcelas, setPagamentosParcelas] = useState<Movimentacao[]>([]);
  const [selectedNegociacao, setSelectedNegociacao] = useState<Negociacao | null>(null);
  const [selectedMovimentacao, setSelectedMovimentacao] = useState<Movimentacao | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (appUser?.role !== 'MASTER') return;

    const fetchEmpresas = async () => {
      try {
        const q = query(collection(db, 'empresas'), where('ativo', '==', true));
        const snapshot = await getDocs(q);
        const empresasData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Empresa[];
        empresasData.sort((a, b) => (a.nomeFantasia || a.nome || '').localeCompare(b.nomeFantasia || b.nome || ''));
        setEmpresas(empresasData);
      } catch (error) {
        handlePermissionError(error, OperationType.LIST, 'empresas');
      }
    };

    fetchEmpresas();
  }, [appUser, handlePermissionError]);

  if (appUser?.role !== 'MASTER') {
    return <Navigate to="/" replace />;
  }

  const empresaSelecionada = empresas.find(e => e.id === selectedEmpresaId);

  const buscarCliente = async () => {
    if (!codigoCliente || !selectedEmpresaId) {
      alert("Selecione uma empresa e digite o código do cliente.");
      return;
    }

    setLoading(true);
    setCliente(null);
    setNegociacoesQuitadas([]);
    setSelectedNegociacao(null);
    setMovimentacoes([]);

    try {
      const qCliente = query(
        collection(db, 'clientes'),
        where('empresaId', '==', selectedEmpresaId),
        where('codigo', '==', codigoCliente)
      );
      const clienteSnap = await getDocs(qCliente);

      if (clienteSnap.empty) {
        alert("Cliente não encontrado para esta empresa.");
        setLoading(false);
        return;
      }

      const clienteData = { id: clienteSnap.docs[0].id, ...clienteSnap.docs[0].data() } as Cliente;
      setCliente(clienteData);

      // Buscar negociações quitadas
      const qNeg = query(
        collection(db, 'negociacoes'),
        where('cliente_id', '==', clienteData.id)
      );
      const negSnap = await getDocs(qNeg);
      const allNegs = negSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Negociacao));
      setAllNegociacoes(allNegs);
      
      const quitadas = allNegs.filter(n => n.status === 'QUITADO');
      quitadas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNegociacoesQuitadas(quitadas);

      // Buscar todos os recebimentos (inclusive Entrada, Quitacao, Resgate)
      const qMov = query(
        collection(db, 'movimentacoes'),
        where('cliente_id', '==', clienteData.id),
        where('tipo', 'in', ['PAGAMENTO', 'ENTRADA', 'QUITACAO', 'RESGATE'])
      );
      const movSnap = await getDocs(qMov);
      const movs = movSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movimentacao))
        .filter(m => {
          // Ignorar se não for de parcela numerada, entrada, quitacao ou resgate
          if (m.numero_parcela === undefined && !['ENTRADA', 'QUITACAO', 'RESGATE'].includes(m.tipo)) return false;
          
          // CRÍTICO: Ignorar movimentações de negociações estornadas
          if (m.negociacao_id) {
            const parentNeg = allNegs.find(n => n.id === m.negociacao_id);
            if (parentNeg && parentNeg.status === 'ESTORNADO') {
              return false;
            }
          }
          return true;
        });
      movs.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      setPagamentosParcelas(movs);

    } catch (error) {
      console.error("Erro ao buscar cliente/negociações:", error);
      alert("Erro ao buscar dados do cliente.");
    } finally {
      setLoading(false);
    }
  };

  const selecionarNegociacao = async (neg: Negociacao) => {
    setSelectedNegociacao(neg);
    setSelectedMovimentacao(null);
    try {
      const qMov = query(
        collection(db, 'movimentacoes'),
        where('negociacao_id', '==', neg.id)
      );
      const movSnap = await getDocs(qMov);
      const movs = movSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movimentacao));
      movs.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
      setMovimentacoes(movs);
    } catch (error) {
      console.error("Erro ao buscar movimentações:", error);
    }
  };

  const selecionarMovimentacao = (mov: Movimentacao) => {
    setSelectedMovimentacao(mov);
    const parentNeg = allNegociacoes.find(n => n.id === mov.negociacao_id);
    if (parentNeg) {
      setSelectedNegociacao(parentNeg);
      setMovimentacoes([mov]);
    } else {
      setSelectedNegociacao(null);
      setMovimentacoes([]);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = () => {
    if (!selectedNegociacao || !cliente) return;
    
    let mensagem = "";
    if (selectedMovimentacao) {
      const valorFormatado = formatCurrency(selectedMovimentacao.valor);
      const totalParcelas = selectedNegociacao.numero_parcelas || 0;
      const textoParcela = totalParcelas > 0
        ? `${selectedMovimentacao.numero_parcela}/${totalParcelas}`
        : `${selectedMovimentacao.numero_parcela}`;

      const trechoPagamento = selectedMovimentacao.tipo === 'ENTRADA'
        ? `referente à entrada `
        : `referente à parcela ${textoParcela} `;
      
      mensagem = `Olá, ${cliente.nome}!\n\n` +
        `Segue seu recibo ${trechoPagamento}` +
        `do título nº ${selectedNegociacao.numeroTitulo}, no valor de ${valorFormatado}.\n\n` +
        `Obrigado!`;
    } else {
      const totalFormatado = formatCurrency(selectedNegociacao.valorTotal || selectedNegociacao.valor);
      mensagem = `Olá, ${cliente.nome}!\n\n` +
        `Segue seu recibo de quitação referente ao título nº ${selectedNegociacao.numeroTitulo}, no valor de ${totalFormatado}.\n\n` +
        `Obrigado!`;
    }

    const url = `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const dataEmissao = new Date().toLocaleDateString('pt-BR');

  return (
    <div className="space-y-6">
      {/* AREA INTERATIVA */}
      <div className="print:hidden flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Emissão de Recibo</h1>
            <p className="mt-1 text-sm text-gray-500">Gere e envie recibos de quitação para os clientes.</p>
          </div>
          <div className="flex space-x-3">
            <Button variant="secondary" onClick={handleWhatsApp} disabled={!selectedNegociacao}>
              <MessageCircle className="w-4 h-4 mr-2" />
              WhatsApp
            </Button>
            <Button onClick={handlePrint} disabled={!selectedNegociacao}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir Recibo
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6 print:hidden">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-medium text-gray-900">Empresa e Cliente</h2>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Empresa Parceira</label>
                  <select
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={selectedEmpresaId}
                    onChange={(e) => {
                      setSelectedEmpresaId(e.target.value);
                      setCliente(null);
                      setNegociacoesQuitadas([]);
                    }}
                  >
                    <option value="">-- Selecione --</option>
                    {empresas.map(e => (
                      <option key={e.id} value={e.id}>{e.nomeFantasia || e.nome}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end space-x-2">
                  <div className="flex-1">
                    <Input
                      label="Código do Cliente"
                      value={codigoCliente}
                      onChange={(e) => setCodigoCliente(e.target.value)}
                      placeholder="Ex: 1020"
                    />
                  </div>
                  <Button onClick={buscarCliente} disabled={loading || !selectedEmpresaId}>
                    <Search className="w-4 h-4" />
                  </Button>
                </div>

                {cliente && (
                  <div className="bg-blue-50 p-4 rounded-md border border-blue-100 flex items-center space-x-3">
                    <User className="w-10 h-10 text-blue-600 bg-white p-2 rounded-full border border-blue-200" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-blue-900 truncate">{cliente.nome}</p>
                      <p className="text-xs text-blue-700">Código: {cliente.codigo}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {cliente && (
              <div className="space-y-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2 mb-4">
                      <Receipt className="w-5 h-5 text-green-600" />
                      <h2 className="text-lg font-medium text-gray-900">Parcelas Pagas</h2>
                    </div>
                    
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {pagamentosParcelas.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">Nenhuma parcela paga encontrada.</p>
                      ) : (
                        pagamentosParcelas.map(mov => (
                          <button
                            key={mov.id}
                            onClick={() => selecionarMovimentacao(mov)}
                            className={`w-full text-left p-3 rounded-lg border transition-all ${
                              selectedMovimentacao?.id === mov.id
                                ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-sm font-bold text-gray-900">
                                {mov.tipo === 'ENTRADA' ? 'Entrada' : `Parcela ${mov.numero_parcela}`}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold uppercase">PAID</span>
                            </div>
                            <p className="text-xs text-gray-500 mb-2">Pago em: {new Date(mov.data).toLocaleDateString('pt-BR')}</p>
                            <p className="text-sm font-black text-green-600">{formatCurrency(mov.valor)}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2 mb-4">
                      <CheckCircle className="w-5 h-5 text-blue-600" />
                      <h2 className="text-lg font-medium text-gray-900">Títulos Quitados</h2>
                    </div>
                    
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {negociacoesQuitadas.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">Nenhum título quitado encontrado.</p>
                      ) : (
                        negociacoesQuitadas.map(neg => (
                          <button
                            key={neg.id}
                            onClick={() => selecionarNegociacao(neg)}
                            className={`w-full text-left p-3 rounded-lg border transition-all ${
                              selectedNegociacao?.id === neg.id && !selectedMovimentacao
                                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-sm font-bold text-gray-900">Título: {neg.numeroTitulo}</span>
                              <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold uppercase">Quitado</span>
                            </div>
                            <p className="text-xs text-gray-500 mb-2">Realizado em: {new Date(neg.createdAt).toLocaleDateString('pt-BR')}</p>
                            <p className="text-sm font-black text-blue-600">{formatCurrency(neg.valorTotal || neg.valor)}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-6 print:col-span-3">
            {selectedNegociacao ? (
              <Card className="min-h-[600px] flex flex-col print:shadow-none print:border-none print:min-h-0">
                <CardContent className="p-12 flex-1 print:p-0">
                  <div className="max-w-2xl mx-auto space-y-12 recibo-container">
                    {/* Cabeçalho do Recibo */}
                    <div className="text-center border-b pb-8">
                      <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center">
                          <Receipt className="w-10 h-10 text-white" />
                        </div>
                      </div>
                      <h2 className="text-2xl font-black text-gray-900 tracking-widest uppercase">Recibo de Pagamento</h2>
                      <p className="text-sm text-gray-500 mt-1">RenovaCred Soluções em Cobrança</p>
                    </div>

                    {/* Corpo do Recibo */}
                    <div className="text-lg text-gray-800 leading-relaxed text-center px-4">
                      <p>
                        Recebemos de <span className="font-black text-gray-900">{cliente?.nome}</span>{cliente?.cpf ? `, inscrito(a) sob o CPF: ${cliente.cpf}` : ''}, 
                        inscrito sob o código <span className="font-bold">{cliente?.codigo}</span>, 
                        a importância de <span className="font-black text-blue-600">{formatCurrency(selectedMovimentacao ? selectedMovimentacao.valor : (selectedNegociacao.valorTotal || selectedNegociacao.valor))}</span>, 
                        referente ao pagamento {selectedMovimentacao ? (selectedMovimentacao.tipo === 'ENTRADA' ? 'da entrada' : `da parcela ${(selectedNegociacao.numero_parcelas || 0) > 0 ? `${selectedMovimentacao.numero_parcela}/${selectedNegociacao.numero_parcelas}` : selectedMovimentacao.numero_parcela}`) : 'integral'} do título nº <span className="font-bold">{selectedNegociacao.numeroTitulo}</span>, 
                        vinculado à negociação realizada em {new Date(selectedNegociacao.createdAt).toLocaleDateString('pt-BR')}.
                      </p>
                      {selectedMovimentacao ? (
                        <p className="mt-6 font-medium">
                          Confirmamos o recebimento da parcela individual acima identificada.
                        </p>
                      ) : (
                        <p className="mt-6 font-medium">
                          Declaramos que o referido débito encontra-se totalmente quitado, 
                          não havendo pendências até a presente data.
                        </p>
                      )}
                    </div>

                    {/* Detalhamento de Pagamentos (Ledger) */}
                    {movimentacoes.length > 0 && (
                      <div className="mt-12 bg-gray-50 rounded-xl p-6 border border-gray-100">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Histórico de Pagamentos</h3>
                        <div className="space-y-3">
                          {movimentacoes.map(mov => (
                            <div key={mov.id} className="flex justify-between items-center text-sm">
                              <div className="flex items-center space-x-3">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                <span className="text-gray-600">{new Date(mov.data).toLocaleDateString('pt-BR')}</span>
                                <span className="font-medium text-gray-900">{mov.tipo}</span>
                              </div>
                              <span className="font-bold text-gray-900">{formatCurrency(mov.valor)}</span>
                            </div>
                          ))}
                          <div className="pt-3 mt-3 border-t border-gray-200 flex justify-between items-center font-black">
                            <span className="text-gray-900 uppercase text-xs">Total Liquidado</span>
                            <span className="text-blue-600">
                              {formatCurrency(selectedMovimentacao ? selectedMovimentacao.valor : (selectedNegociacao.valorTotal || selectedNegociacao.valor))}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rodapé do Recibo */}
                    <div className="pt-16 space-y-8">
                      <div className="grid grid-cols-2 gap-8 text-sm text-gray-500">
                        <div>
                          <p className="font-bold text-gray-900 uppercase text-xs tracking-wider mb-1">Empresa Credora</p>
                          <p>{empresaSelecionada?.nomeFantasia || empresaSelecionada?.nome}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900 uppercase text-xs tracking-wider mb-1">Data de Emissão</p>
                          <p>{dataEmissao}</p>
                        </div>
                      </div>

                      <div className="pt-12 text-center">
                        <div className="w-48 h-px bg-gray-300 mx-auto mb-2"></div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Assinatura Digital RenovaCred</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <Receipt className="w-16 h-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">Nenhum Recibo Selecionado</h3>
                <p className="text-sm text-gray-500 max-w-xs mt-1">Selecione uma empresa, busque o cliente e escolha um título quitado para visualizar o recibo.</p>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
