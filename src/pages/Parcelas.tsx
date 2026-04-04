import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CheckCircle } from 'lucide-react';

interface Parcela {
  id: string;
  negociacao_id: string;
  numero_parcela: number;
  valor: number;
  status: 'PENDENTE' | 'PAGO' | 'ATRASADO';
  data_vencimento: string;
}

interface Negociacao {
  id: string;
  cliente_id: string;
  cobrador_id: string;
  empresa_id: string;
}

interface Cliente {
  id: string;
  nome: string;
  empresa_id: string;
}

export default function Parcelas() {
  const { appUser } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);

  useEffect(() => {
    let qClientes = query(collection(db, 'clientes'));
    if (selectedEmpresa) {
      qClientes = query(collection(db, 'clientes'), where('empresa_id', '==', selectedEmpresa.id));
    }
    const unsubClientes = onSnapshot(qClientes, (snapshot) => {
      setClientes(snapshot.docs.map(doc => ({ id: doc.id, nome: doc.data().nome, empresa_id: doc.data().empresa_id } as Cliente)));
    });

    let qNegociacoes = query(collection(db, 'negociacoes'));
    if (selectedEmpresa) {
      qNegociacoes = query(collection(db, 'negociacoes'), where('empresa_id', '==', selectedEmpresa.id));
    }
    const unsubNegociacoes = onSnapshot(qNegociacoes, (snapshot) => {
      setNegociacoes(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        cliente_id: doc.data().cliente_id,
        cobrador_id: doc.data().cobrador_id,
        empresa_id: doc.data().empresa_id
      } as Negociacao)));
    });

    const qParcelas = query(collection(db, 'parcelas'), orderBy('data_vencimento', 'asc'));
    const unsubParcelas = onSnapshot(qParcelas, async (snapshot) => {
      const fetchedParcelas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Parcela));
      
      // Auto-update ATRASADO status
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const updatedParcelas = fetchedParcelas.map(p => {
        if (p.status === 'PENDENTE') {
          const vencimento = new Date(p.data_vencimento);
          vencimento.setHours(0, 0, 0, 0);
          if (vencimento < today) {
            // Update in DB asynchronously
            updateDoc(doc(db, 'parcelas', p.id), { status: 'ATRASADO' }).catch(console.error);
            return { ...p, status: 'ATRASADO' as const };
          }
        }
        return p;
      });

      setParcelas(updatedParcelas);
    });

    return () => {
      unsubClientes();
      unsubNegociacoes();
      unsubParcelas();
    };
  }, [selectedEmpresa]);

  const handleMarcarPago = async (parcela: Parcela) => {
    if (!window.confirm('Tem certeza que deseja marcar esta parcela como PAGA? O pagamento deve ser registrado via Nova Negociação -> Pagamento de Parcela.')) {
      return;
    }
    try {
      await updateDoc(doc(db, 'parcelas', parcela.id), { status: 'PAGO' });
      alert('Status da parcela atualizado para PAGO.');
    } catch (error) {
      console.error("Error updating parcela:", error);
      alert('Erro ao atualizar parcela.');
    }
  };

  const getClienteNome = (negociacao_id: string) => {
    const neg = negociacoes.find(n => n.id === negociacao_id);
    if (!neg) return 'Desconhecido';
    const cliente = clientes.find(c => c.id === neg.cliente_id);
    return cliente ? cliente.nome : 'Desconhecido';
  };

  const filteredParcelas = parcelas.filter(p => {
    if (appUser?.role === 'COBRADOR') {
      const neg = negociacoes.find(n => n.id === p.negociacao_id);
      return neg?.cobrador_id === appUser.id;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Parcelas</h1>
        <p className="mt-1 text-sm text-gray-500">Controle de parcelas de negociações.</p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vencimento</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parcela</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredParcelas.map((parcela) => (
                <tr key={parcela.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(parcela.data_vencimento).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {getClienteNome(parcela.negociacao_id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {parcela.numero_parcela}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parcela.valor)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${parcela.status === 'PAGO' ? 'bg-green-100 text-green-800' : 
                        parcela.status === 'ATRASADO' ? 'bg-red-100 text-red-800' : 
                        'bg-yellow-100 text-yellow-800'}`}>
                      {parcela.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {parcela.status !== 'PAGO' && (
                      <Button variant="secondary" size="sm" onClick={() => handleMarcarPago(parcela)} title="Marcar como Pago">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredParcelas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                    Nenhuma parcela encontrada.
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
