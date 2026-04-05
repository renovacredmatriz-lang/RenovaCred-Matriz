import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
import { collection, onSnapshot, query, orderBy, runTransaction, doc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, X, RotateCcw } from 'lucide-react';
import { logAction } from '../utils/auditLogger';

interface Negociacao {
  id: string;
  cliente_id: string;
  empresaId: string;
  cobrador_id: string;
  uid?: string;
  tipo: 'QUITACAO' | 'PARCELAMENTO' | 'PARCELA' | 'RESGATE';
  valor: number;
  valor_entrada?: number;
  numero_parcelas?: number;
  observacoes?: string;
  status: 'ATIVO' | 'ESTORNADO';
  createdAt: string;
}

interface Cliente {
  id: string;
  nome: string;
  valor_debito: number;
  empresaId: string;
}

export default function Negociacoes() {
  const { appUser } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    cliente_id: '',
    tipo: 'QUITACAO' as 'QUITACAO' | 'PARCELAMENTO' | 'PARCELA' | 'RESGATE',
    valor: 0,
    valor_entrada: 0,
    numero_parcelas: 1,
    observacoes: ''
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser || appUser.role !== 'COBRADOR') {
      alert("Apenas cobradores podem registrar negociações.");
      return;
    }

    const cliente = clientes.find(c => c.id === formData.cliente_id);
    if (!cliente) return;

    try {
      const negociacaoId = await runTransaction(db, async (transaction) => {
        const clienteRef = doc(db, 'clientes', cliente.id);
        const clienteDoc = await transaction.get(clienteRef);
        
        if (!clienteDoc.exists()) {
          throw new Error("Cliente não encontrado!");
        }

        const debitoAtual = clienteDoc.data().valor_debito;
        let valorPago = 0;
        let valorTotalNegociado = formData.valor;

        if (formData.tipo === 'QUITACAO') {
          valorPago = debitoAtual;
          valorTotalNegociado = debitoAtual;
        } else if (formData.tipo === 'PARCELAMENTO') {
          valorPago = formData.valor_entrada;
        } else if (formData.tipo === 'PARCELA' || formData.tipo === 'RESGATE') {
          valorPago = formData.valor;
        }

        const novoDebito = debitoAtual - valorPago;
        if (novoDebito < 0) {
          throw new Error("O valor pago não pode ser maior que o débito atual.");
        }

        // Update client debt
        transaction.update(clienteRef, { valor_debito: novoDebito });

        // Create negotiation
        const newNegociacaoRef = doc(collection(db, 'negociacoes'));
        transaction.set(newNegociacaoRef, {
          cliente_id: cliente.id,
          empresaId: selectedEmpresa?.id || cliente.empresaId,
          cobrador_id: appUser.id,
          uid: appUser.uid,
          tipo: formData.tipo,
          valor: valorTotalNegociado,
          valor_entrada: formData.valor_entrada,
          numero_parcelas: formData.numero_parcelas,
          observacoes: formData.observacoes,
          status: 'ATIVO',
          createdAt: new Date().toISOString()
        });

        // Create Movimentacao (Ledger)
        if (valorPago > 0) {
          const movRef = doc(collection(db, 'movimentacoes'));
          transaction.set(movRef, {
            cliente_id: cliente.id,
            negociacao_id: newNegociacaoRef.id,
            empresaId: selectedEmpresa?.id || cliente.empresaId,
            uid: appUser.uid,
            tipo: 'PAGAMENTO',
            valor: valorPago,
            saldo_anterior: debitoAtual,
            saldo_atual: novoDebito,
            data: new Date().toISOString(),
            cobrador_id: appUser.id
          });
        }

        // If it's a parcelamento, we should also create the parcelas
        if (formData.tipo === 'PARCELAMENTO' && formData.numero_parcelas > 0) {
          const valorRestante = valorTotalNegociado - formData.valor_entrada;
          const valorParcela = valorRestante / formData.numero_parcelas;
          
          for (let i = 1; i <= formData.numero_parcelas; i++) {
            const parcelaRef = doc(collection(db, 'parcelas'));
            const dataVencimento = new Date();
            dataVencimento.setMonth(dataVencimento.getMonth() + i);
            
            transaction.set(parcelaRef, {
              negociacao_id: newNegociacaoRef.id,
              empresaId: selectedEmpresa?.id || cliente.empresaId,
              uid: appUser.uid,
              numero_parcela: i,
              valor: valorParcela,
              status: 'PENDENTE',
              data_vencimento: dataVencimento.toISOString()
            });
          }
        }
        
        return newNegociacaoRef.id;
      });

      logAction(appUser, 'CRIAR_NEGOCIACAO', 'negociacao', negociacaoId, {
        tipo: formData.tipo,
        valor: formData.valor,
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
      await runTransaction(db, async (transaction) => {
        const clienteRef = doc(db, 'clientes', negociacao.cliente_id);
        const clienteDoc = await transaction.get(clienteRef);
        
        if (!clienteDoc.exists()) throw new Error("Cliente não encontrado!");

        const debitoAtual = clienteDoc.data().valor_debito;
        let valorRevertido = 0;

        if (negociacao.tipo === 'QUITACAO') {
          valorRevertido = negociacao.valor;
        } else if (negociacao.tipo === 'PARCELAMENTO') {
          valorRevertido = negociacao.valor_entrada || 0;
        } else if (negociacao.tipo === 'PARCELA' || negociacao.tipo === 'RESGATE') {
          valorRevertido = negociacao.valor;
        }

        const novoDebito = debitoAtual + valorRevertido;

        // Update client debt
        transaction.update(clienteRef, { valor_debito: novoDebito });

        // Update negotiation status
        const negRef = doc(db, 'negociacoes', negociacao.id);
        transaction.update(negRef, { status: 'ESTORNADO' });

        // Create Movimentacao (Estorno)
        if (valorRevertido > 0) {
          const movRef = doc(collection(db, 'movimentacoes'));
          transaction.set(movRef, {
            cliente_id: negociacao.cliente_id,
            negociacao_id: negociacao.id,
            empresaId: selectedEmpresa?.id || negociacao.empresaId,
            uid: appUser.uid,
            tipo: 'ESTORNO',
            valor: valorRevertido,
            saldo_anterior: debitoAtual,
            saldo_atual: novoDebito,
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
      cliente_id: '',
      tipo: 'QUITACAO',
      valor: 0,
      valor_entrada: 0,
      numero_parcelas: 1,
      observacoes: ''
    });
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden my-8">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Nova Negociação</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  value={formData.cliente_id}
                  onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
                  required
                >
                  <option value="">Selecione um cliente</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} (Débito: R$ {c.valor_debito.toFixed(2)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Negociação</label>
                <select
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  value={formData.tipo}
                  onChange={(e) => setFormData({ ...formData, tipo: e.target.value as any })}
                  required
                >
                  <option value="QUITACAO">Quitação</option>
                  <option value="PARCELAMENTO">Entrada + Parcelamento</option>
                  <option value="PARCELA">Pagamento de Parcela</option>
                  <option value="RESGATE">Resgate de Objeto</option>
                </select>
              </div>

              {formData.tipo !== 'QUITACAO' && (
                <Input
                  label="Valor Total Negociado (R$)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.valor}
                  onChange={(e) => setFormData({ ...formData, valor: parseFloat(e.target.value) })}
                  required
                />
              )}

              {formData.tipo === 'PARCELAMENTO' && (
                <>
                  <Input
                    label="Valor da Entrada (R$)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.valor_entrada}
                    onChange={(e) => setFormData({ ...formData, valor_entrada: parseFloat(e.target.value) })}
                    required
                  />
                  <Input
                    label="Número de Parcelas"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.numero_parcelas}
                    onChange={(e) => setFormData({ ...formData, numero_parcelas: parseInt(e.target.value) })}
                    required
                  />
                </>
              )}

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
