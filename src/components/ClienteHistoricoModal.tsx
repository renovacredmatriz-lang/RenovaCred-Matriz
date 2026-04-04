import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { X } from 'lucide-react';

interface ClienteHistoricoModalProps {
  cliente: { id: string; nome: string; valor_debito: number };
  onClose: () => void;
}

interface Movimentacao {
  id: string;
  tipo: string;
  valor: number;
  saldo_anterior: number;
  saldo_atual: number;
  data: string;
}

interface Negociacao {
  id: string;
  tipo: string;
  valor: number;
  valor_entrada?: number;
  numero_parcelas?: number;
  status: string;
  createdAt: string;
}

export function ClienteHistoricoModal({ cliente, onClose }: ClienteHistoricoModalProps) {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const qMov = query(
          collection(db, 'movimentacoes'),
          where('cliente_id', '==', cliente.id)
        );
        const movSnapshot = await getDocs(qMov);
        const movData = movSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movimentacao));
        // Sort manually since we might need composite index for where + orderBy
        movData.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
        setMovimentacoes(movData);

        const qNeg = query(
          collection(db, 'negociacoes'),
          where('cliente_id', '==', cliente.id)
        );
        const negSnapshot = await getDocs(qNeg);
        const negData = negSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Negociacao));
        negData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNegociacoes(negData);

      } catch (error) {
        console.error("Error fetching history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [cliente.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Histórico do Cliente</h3>
            <p className="text-sm text-gray-500">{cliente.nome} - Débito Atual: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cliente.valor_debito)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-8">
          {loading ? (
            <div className="text-center py-4 text-gray-500">Carregando histórico...</div>
          ) : (
            <>
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-4">Negociações</h4>
                {negociacoes.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma negociação registrada.</p>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Entrada</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Parcelas</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {negociacoes.map(neg => (
                          <tr key={neg.id} className={neg.status === 'ESTORNADO' ? 'bg-red-50' : ''}>
                            <td className="px-4 py-2 text-sm text-gray-500">{new Date(neg.createdAt).toLocaleDateString('pt-BR')}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{neg.tipo}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{neg.status}</td>
                            <td className="px-4 py-2 text-sm font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(neg.valor)}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{neg.valor_entrada ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(neg.valor_entrada) : '-'}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{neg.numero_parcelas || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-md font-medium text-gray-900 mb-4">Movimentações Financeiras (Ledger)</h4>
                {movimentacoes.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma movimentação registrada.</p>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Saldo Anterior</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Saldo Atual</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {movimentacoes.map(mov => (
                          <tr key={mov.id} className={mov.tipo === 'ESTORNO' ? 'bg-red-50' : ''}>
                            <td className="px-4 py-2 text-sm text-gray-500">{new Date(mov.data).toLocaleDateString('pt-BR')} {new Date(mov.data).toLocaleTimeString('pt-BR')}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{mov.tipo}</td>
                            <td className={`px-4 py-2 text-sm font-medium ${mov.tipo === 'ESTORNO' ? 'text-red-600' : 'text-green-600'}`}>
                              {mov.tipo === 'ESTORNO' ? '+' : '-'}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mov.valor)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mov.saldo_anterior)}</td>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mov.saldo_atual)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
