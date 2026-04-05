import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
import { collection, onSnapshot, query, orderBy, runTransaction, doc, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, X, RotateCcw } from 'lucide-react';
import { logAction } from '../utils/auditLogger';

interface Negociacao {
  id: string;
  cliente_id: string;
  clienteNome?: string;
  empresaId: string;
  cobrador_id: string;
  uid?: string;
  tipo: 'QUITACAO' | 'PARCELAMENTO' | 'PARCELA' | 'RESGATE';
  valor: number;
  valorTotal?: number;
  valorDebito?: number;
  valor_entrada?: number;
  numero_parcelas?: number;
  tipoJuros?: string;
  valorJuros?: number;
  observacoes?: string;
  parcela_id?: string;
  status: 'ATIVO' | 'ESTORNADO';
  createdAt: string;
}

interface Cliente {
  id: string;
  codigo: string;
  nome: string;
  valor_debito: number;
  empresaId: string;
}

interface ParcelaGerada {
  numero: number;
  valor: number;
  vencimento: string;
}

interface ParcelaAberta {
  id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  negociacao_id: string;
  status: string;
}

export default function Negociacoes() {
  const { appUser, currentUser } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    codigoCliente: '',
    cliente_id: '',
    clienteNome: '',
    valorDebito: 0,
    tipo: 'QUITACAO' as 'QUITACAO' | 'PARCELAMENTO' | 'PARCELA' | 'RESGATE',
    valorTotal: 0,
    valor_entrada: 0,
    numero_parcelas: 1,
    tipoJuros: 'NENHUM',
    valorJuros: 0,
    observacoes: ''
  });

  const [parcelasGeradas, setParcelasGeradas] = useState<ParcelaGerada[]>([]);
  const [parcelasAbertas, setParcelasAbertas] = useState<ParcelaAberta[]>([]);
  const [parcelaSelecionadaId, setParcelaSelecionadaId] = useState<string>('');

  useEffect(() => {
    let qClientes = query(collection(db, 'clientes'), orderBy('nome'));
    if (selectedEmpresa) {
      qClientes = query(collection(db, 'clientes'), where('empresaId', '==', selectedEmpresa.id), orderBy('nome'));
    }
    
    const unsubClientes = onSnapshot(qClientes, (snapshot) => {
      const validClientes = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Cliente))
        .filter(c => c.empresaId);
      setClientes(validClientes);
    });

    let qNegociacoes = query(collection(db, 'negociacoes'), orderBy('createdAt', 'desc'));
    if (selectedEmpresa) {
      qNegociacoes = query(collection(db, 'negociacoes'), where('empresaId', '==', selectedEmpresa.id), orderBy('createdAt', 'desc'));
    }

    const unsubNegociacoes = onSnapshot(qNegociacoes, (snapshot) => {
      const validNegociacoes = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Negociacao))
        .filter(n => n.empresaId);
      setNegociacoes(validNegociacoes);
    });

    return () => {
      unsubClientes();
      unsubNegociacoes();
    };
  }, [selectedEmpresa]);

  const buscarClientePorCodigo = async () => {
    if (!formData.codigoCliente) return;
    const cliente = clientes.find(c => c.codigo === formData.codigoCliente);
    if (cliente) {
      setFormData(prev => ({
        ...prev,
        cliente_id: cliente.id,
        clienteNome: cliente.nome,
        valorDebito: cliente.valor_debito
      }));
      
      try {
        const q = query(collection(db, 'parcelas'), 
          where('empresaId', '==', selectedEmpresa?.id), 
          where('cliente_id', '==', cliente.id)
        );
        const snapshot = await getDocs(q);
        const abertas = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as ParcelaAberta))
          .filter(p => p.status === 'PENDENTE' || p.status === 'ATRASADO');
        setParcelasAbertas(abertas);
      } catch (err) {
        console.error("Erro ao buscar parcelas:", err);
      }
    } else {
      alert("Cliente não encontrado.");
      setFormData(prev => ({ ...prev, cliente_id: '', clienteNome: '', valorDebito: 0 }));
      setParcelasAbertas([]);
    }
  };

  useEffect(() => {
    let juros = 0;
    if (formData.tipoJuros === 'FIXO') {
      juros = formData.valorJuros;
    } else if (formData.tipoJuros === 'PERCENTUAL') {
      juros = formData.valorDebito * (formData.valorJuros / 100);
    }
    const total = formData.valorDebito + juros;
    setFormData(prev => ({ ...prev, valorTotal: total }));
  }, [formData.valorDebito, formData.tipoJuros, formData.valorJuros]);

  useEffect(() => {
    if (formData.tipo === 'PARCELAMENTO' && formData.numero_parcelas > 0) {
      const restante = formData.valorTotal - formData.valor_entrada;
      const valorParcela = restante / formData.numero_parcelas;
      const novasParcelas: ParcelaGerada[] = [];
      for (let i = 1; i <= formData.numero_parcelas; i++) {
        const data = new Date();
        data.setMonth(data.getMonth() + i);
        novasParcelas.push({
          numero: i,
          valor: parseFloat(valorParcela.toFixed(2)),
          vencimento: data.toISOString().split('T')[0]
        });
      }
      setParcelasGeradas(novasParcelas);
    } else {
      setParcelasGeradas([]);
    }
  }, [formData.tipo, formData.valorTotal, formData.valor_entrada, formData.numero_parcelas]);

  const handleParcelaChange = (index: number, field: keyof ParcelaGerada, value: any) => {
    const updated = [...parcelasGeradas];
    updated[index] = { ...updated[index], [field]: value };
    setParcelasGeradas(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedEmpresa?.id) {
      alert("Selecione uma empresa antes de continuar");
      return;
    }

    if (!currentUser?.uid) {
      alert("Usuário não autenticado");
      return;
    }

    if (!appUser || appUser.role !== 'COBRADOR') {
      alert("Apenas cobradores podem registrar negociações.");
      return;
    }

    const cliente = clientes.find(c => c.id === formData.cliente_id);
    if (!cliente) {
      alert("Cliente inválido.");
      return;
    }

    if (formData.tipo === 'PARCELA' && !parcelaSelecionadaId) {
      alert("Selecione uma parcela para pagar.");
      return;
    }

    if (formData.tipo === 'PARCELAMENTO') {
      const somaParcelas = parcelasGeradas.reduce((acc, p) => acc + p.valor, 0);
      const valorRestante = formData.valorTotal - formData.valor_entrada;
      if (Math.abs(somaParcelas - valorRestante) > 0.01) {
        alert("A soma das parcelas não confere com o valor restante.");
        return;
      }
    }

    const payload = {
      cliente_id: cliente.id,
      clienteNome: cliente.nome,
      empresaId: selectedEmpresa.id,
      uid: currentUser.uid,
      cobrador_id: appUser.id,
      tipo: formData.tipo,
      valor: formData.valorTotal,
      valorTotal: formData.valorTotal,
      valorDebito: formData.valorDebito,
      valor_entrada: formData.valor_entrada,
      numero_parcelas: formData.numero_parcelas,
      tipoJuros: formData.tipoJuros,
      valorJuros: formData.valorJuros,
      observacoes: formData.observacoes,
      status: 'ATIVO',
      createdAt: new Date().toISOString(),
      ...(formData.tipo === 'PARCELA' ? { parcela_id: parcelaSelecionadaId } : {})
    };

    console.log("CLIENTE:", cliente);
    console.log("NEGOCIACAO:", payload);
    console.log("PARCELAS:", parcelasGeradas);

    try {
      const negociacaoId = await runTransaction(db, async (transaction) => {
        const clienteRef = doc(db, 'clientes', cliente.id);
        const clienteDoc = await transaction.get(clienteRef);
        
        if (!clienteDoc.exists()) {
          throw new Error("Cliente não encontrado!");
        }

        const debitoAtual = clienteDoc.data().valor_debito;
        let valorPago = 0;

        if (formData.tipo === 'QUITACAO') {
          valorPago = debitoAtual;
        } else if (formData.tipo === 'PARCELAMENTO') {
          valorPago = formData.valor_entrada;
        } else if (formData.tipo === 'PARCELA') {
          const parcelaRef = doc(db, 'parcelas', parcelaSelecionadaId);
          const parcelaDoc = await transaction.get(parcelaRef);
          if (!parcelaDoc.exists()) throw new Error("Parcela não encontrada!");
          
          valorPago = parcelaDoc.data().valor;
          transaction.update(parcelaRef, { status: 'PAGO' });
          
          const hoje = new Date().toISOString().split('T')[0];
          const vencimento = new Date(parcelaDoc.data().data_vencimento).toISOString().split('T')[0];
          if (vencimento === hoje) {
            alert("Atenção: Esta parcela vence hoje!");
          }
        } else if (formData.tipo === 'RESGATE') {
          valorPago = debitoAtual;
        }

        const novoDebito = debitoAtual - valorPago;
        if (novoDebito < -0.01) {
          throw new Error("O valor pago não pode ser maior que o débito atual.");
        }

        console.log("SALDO ANTES:", debitoAtual);
        console.log("VALOR PAGO:", valorPago);
        console.log("SALDO FINAL:", novoDebito);

        // Update client debt
        transaction.update(clienteRef, { valor_debito: Math.max(0, novoDebito) });

        // Create negotiation
        const newNegociacaoRef = doc(collection(db, 'negociacoes'));
        transaction.set(newNegociacaoRef, payload);

        // Create Movimentacao (Ledger)
        if (valorPago > 0) {
          const movRef = doc(collection(db, 'movimentacoes'));
          transaction.set(movRef, {
            cliente_id: cliente.id,
            negociacao_id: newNegociacaoRef.id,
            empresaId: selectedEmpresa.id,
            uid: currentUser.uid,
            tipo: 'PAGAMENTO',
            valor: valorPago,
            saldo_anterior: debitoAtual,
            saldo_atual: Math.max(0, novoDebito),
            data: new Date().toISOString(),
            cobrador_id: appUser.id
          });
        }

        // Create Parcelas
        if (formData.tipo === 'PARCELAMENTO' && parcelasGeradas.length > 0) {
          for (const p of parcelasGeradas) {
            const parcelaRef = doc(collection(db, 'parcelas'));
            const [year, month, day] = p.vencimento.split('-');
            const dataVencimento = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);

            transaction.set(parcelaRef, {
              negociacao_id: newNegociacaoRef.id,
              cliente_id: cliente.id,
              empresaId: selectedEmpresa.id,
              uid: currentUser.uid,
              numero_parcela: p.numero,
              valor: p.valor,
              status: 'PENDENTE',
              data_vencimento: dataVencimento.toISOString(),
              createdAt: new Date().toISOString()
            });
          }
        }
        
        return newNegociacaoRef.id;
      });

      logAction(appUser, 'CRIAR_NEGOCIACAO', 'negociacao', negociacaoId, {
        tipo: formData.tipo,
        valor: formData.valorTotal,
        cliente_id: cliente.id
      });

      setIsModalOpen(false);
      resetForm();
      alert("Negociação registrada com sucesso!");
    } catch (error: any) {
      console.error("Error saving negociacao:", error);
      alert(error.message || "Erro ao registrar negociação.");
    }
  };

  const handleEstorno = async (negociacao: Negociacao) => {
    if (!appUser || appUser.role !== 'COBRADOR') return;
    if (negociacao.status === 'ESTORNADO') return;
    
    if (!window.confirm("Tem certeza que deseja estornar esta negociação? O saldo do cliente será revertido.")) {
      return;
    }

    try {
      const qParcelas = query(collection(db, 'parcelas'), where('negociacao_id', '==', negociacao.id));
      const parcelasSnapshot = await getDocs(qParcelas);
      const parcelasIds = parcelasSnapshot.docs.map(d => d.id);

      await runTransaction(db, async (transaction) => {
        const clienteRef = doc(db, 'clientes', negociacao.cliente_id);
        const clienteDoc = await transaction.get(clienteRef);
        
        if (!clienteDoc.exists()) throw new Error("Cliente não encontrado!");

        const debitoAtual = clienteDoc.data().valor_debito;
        let valorRevertido = 0;

        if (negociacao.tipo === 'QUITACAO') {
          valorRevertido = negociacao.valorDebito || negociacao.valor;
        } else if (negociacao.tipo === 'PARCELAMENTO') {
          valorRevertido = negociacao.valor_entrada || 0;
        } else if (negociacao.tipo === 'PARCELA') {
          valorRevertido = negociacao.valor;
        } else if (negociacao.tipo === 'RESGATE') {
          valorRevertido = negociacao.valorDebito || negociacao.valor;
        }

        let novoDebito = debitoAtual + valorRevertido;

        // Update client debt
        transaction.update(clienteRef, { valor_debito: Math.max(0, novoDebito) });

        // Update negotiation status
        const negRef = doc(db, 'negociacoes', negociacao.id);
        transaction.update(negRef, { status: 'ESTORNADO' });

        // Update parcelas status
        for (const pid of parcelasIds) {
          const pRef = doc(db, 'parcelas', pid);
          transaction.update(pRef, { status: 'ESTORNADO' });
        }

        if (negociacao.tipo === 'PARCELA' && negociacao.parcela_id) {
          const pRef = doc(db, 'parcelas', negociacao.parcela_id);
          transaction.update(pRef, { status: 'PENDENTE' });
        }

        // Create Movimentacao (Estorno)
        if (valorRevertido > 0) {
          const movRef = doc(collection(db, 'movimentacoes'));
          transaction.set(movRef, {
            cliente_id: negociacao.cliente_id,
            negociacao_id: negociacao.id,
            empresaId: selectedEmpresa?.id || negociacao.empresaId,
            uid: currentUser?.uid,
            tipo: 'ESTORNO',
            valor: valorRevertido,
            saldo_anterior: debitoAtual,
            saldo_atual: Math.max(0, novoDebito),
            data: new Date().toISOString(),
            cobrador_id: appUser.id
          });
        }
      });

      logAction(appUser, 'ESTORNAR_NEGOCIACAO', 'negociacao', negociacao.id, {
        tipo: negociacao.tipo,
        valor: negociacao.valor
      });

      alert("Negociação estornada com sucesso!");
    } catch (error: any) {
      console.error("Error estornando negociacao:", error);
      alert(error.message || "Erro ao estornar negociação.");
    }
  };

  const resetForm = () => {
    setFormData({
      codigoCliente: '',
      cliente_id: '',
      clienteNome: '',
      valorDebito: 0,
      tipo: 'QUITACAO',
      valorTotal: 0,
      valor_entrada: 0,
      numero_parcelas: 1,
      tipoJuros: 'NENHUM',
      valorJuros: 0,
      observacoes: ''
    });
    setParcelasGeradas([]);
    setParcelasAbertas([]);
    setParcelaSelecionadaId('');
  };

  const getClienteNome = (id: string) => clientes.find(c => c.id === id)?.nome || 'Desconhecido';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Negociações</h1>
          <p className="mt-1 text-sm text-gray-500">Histórico e registro de negociações.</p>
        </div>
        {appUser?.role === 'COBRADOR' && (
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Negociação
          </Button>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrada</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parcelas</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {negociacoes.map((neg) => (
                <tr key={neg.id} className={neg.status === 'ESTORNADO' ? 'opacity-50 bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(neg.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {getClienteNome(neg.cliente_id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      {neg.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {neg.status === 'ESTORNADO' ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        ESTORNADO
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        ATIVO
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(neg.valor)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {neg.valor_entrada ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(neg.valor_entrada) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {neg.numero_parcelas || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {appUser?.role === 'COBRADOR' && neg.status !== 'ESTORNADO' && (
                      <Button variant="danger" size="sm" onClick={() => handleEstorno(neg)} title="Estornar Negociação">
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {negociacoes.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                    Nenhuma negociação registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden my-8">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Nova Negociação</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Código do Cliente"
                  value={formData.codigoCliente}
                  onChange={(e) => setFormData({ ...formData, codigoCliente: e.target.value })}
                  onBlur={buscarClientePorCodigo}
                  required
                />
                <Input
                  label="Nome do Cliente"
                  value={formData.clienteNome}
                  readOnly
                  className="bg-gray-50"
                />
                <Input
                  label="Valor do Débito (R$)"
                  type="number"
                  value={formData.valorDebito}
                  readOnly
                  className="bg-gray-50"
                />
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Juros</label>
                  <select
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={formData.tipoJuros}
                    onChange={(e) => setFormData({ ...formData, tipoJuros: e.target.value })}
                  >
                    <option value="NENHUM">Nenhum</option>
                    <option value="PERCENTUAL">Percentual (%)</option>
                    <option value="FIXO">Valor Fixo (R$)</option>
                  </select>
                </div>
                
                <Input
                  label="Valor Juros"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.valorJuros}
                  onChange={(e) => setFormData({ ...formData, valorJuros: parseFloat(e.target.value) || 0 })}
                  disabled={formData.tipoJuros === 'NENHUM'}
                />

                <Input
                  label="Valor Total Negociado (R$)"
                  type="number"
                  value={formData.valorTotal}
                  readOnly
                  className="bg-gray-50 font-bold text-lg"
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Negociação</label>
                  <select
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={formData.tipo}
                    onChange={(e) => {
                      setFormData({ ...formData, tipo: e.target.value as any });
                      setParcelaSelecionadaId('');
                    }}
                    required
                  >
                    <option value="QUITACAO">Quitação</option>
                    <option value="PARCELAMENTO">Entrada + Parcelamento</option>
                    {parcelasAbertas.length > 0 && <option value="PARCELA">Pagamento de Parcela</option>}
                    <option value="RESGATE">Resgate de Objeto</option>
                  </select>
                </div>
              </div>

              {formData.tipo === 'PARCELA' && parcelasAbertas.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Selecione a Parcela</label>
                  <select
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={parcelaSelecionadaId}
                    onChange={(e) => setParcelaSelecionadaId(e.target.value)}
                    required
                  >
                    <option value="">Selecione...</option>
                    {parcelasAbertas.map(p => (
                      <option key={p.id} value={p.id}>
                        Parcela {p.numero_parcela} - R$ {p.valor.toFixed(2)} - Venc: {new Date(p.data_vencimento).toLocaleDateString('pt-BR')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formData.tipo === 'PARCELAMENTO' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4 mt-4">
                  <Input
                    label="Valor da Entrada (R$)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.valor_entrada}
                    onChange={(e) => setFormData({ ...formData, valor_entrada: parseFloat(e.target.value) || 0 })}
                    required
                  />
                  <Input
                    label="Número de Parcelas"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.numero_parcelas}
                    onChange={(e) => setFormData({ ...formData, numero_parcelas: parseInt(e.target.value) || 1 })}
                    required
                  />
                  
                  {parcelasGeradas.length > 0 && (
                    <div className="md:col-span-2 mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Parcelas Geradas</h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {parcelasGeradas.map((p, index) => (
                          <div key={index} className="flex items-center space-x-2 bg-gray-50 p-2 rounded">
                            <span className="text-sm font-medium w-8">{p.numero}º</span>
                            <Input
                              label=""
                              type="number"
                              step="0.01"
                              value={p.valor}
                              onChange={(e) => handleParcelaChange(index, 'valor', parseFloat(e.target.value) || 0)}
                              className="w-32"
                            />
                            <Input
                              label=""
                              type="date"
                              value={p.vencimento}
                              onChange={(e) => handleParcelaChange(index, 'vencimento', e.target.value)}
                              className="w-40"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  rows={3}
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                />
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-gray-200 mt-6">
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  Registrar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
