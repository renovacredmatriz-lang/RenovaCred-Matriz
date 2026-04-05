import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, deleteDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, CheckCircle, Printer, X, Trash2 } from 'lucide-react';
import { logAction } from '../utils/auditLogger';

interface Agendamento {
  id: string;
  cliente_id: string;
  cobrador_id: string;
  empresaId: string;
  uid?: string;
  data_agendamento: string;
  observacoes: string;
  status: 'PENDENTE' | 'CONCLUIDO';
  createdAt: string;
}

interface Cliente {
  id: string;
  nome: string;
  empresaId: string;
}

export default function Agendamentos() {
  const { appUser } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    cliente_id: '',
    data_agendamento: '',
    observacoes: ''
  });

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
    });

    return () => {
      unsubClientes();
      unsubAgendamentos();
    };
  }, [selectedEmpresa]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;

    const cliente = clientes.find(c => c.id === formData.cliente_id);
    if (!cliente) return;

    try {
      const docRef = await addDoc(collection(db, 'agendamentos'), {
        cliente_id: cliente.id,
        empresaId: selectedEmpresa?.id || cliente.empresaId,
        cobrador_id: appUser.id,
        uid: appUser.uid,
        data_agendamento: new Date(formData.data_agendamento).toISOString(),
        observacoes: formData.observacoes,
        status: 'PENDENTE',
        createdAt: new Date().toISOString()
      });
      logAction(appUser, 'CRIAR_AGENDAMENTO', 'agendamento', docRef.id, formData);
      setIsModalOpen(false);
      setFormData({ cliente_id: '', data_agendamento: '', observacoes: '' });
    } catch (error) {
      console.error("Error saving agendamento:", error);
      alert("Erro ao salvar agendamento.");
    }
  };

  const handleConcluir = async (id: string) => {
    try {
      await updateDoc(doc(db, 'agendamentos', id), { status: 'CONCLUIDO' });
      logAction(appUser, 'CONCLUIR_AGENDAMENTO', 'agendamento', id, {});
    } catch (error) {
      console.error("Error updating agendamento:", error);
      alert("Erro ao concluir agendamento.");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getClienteNome = (id: string) => clientes.find(c => c.id === id)?.nome || 'Desconhecido';

  // Sort: Pendentes first, then Concluidos
  const sortedAgendamentos = [...agendamentos].sort((a, b) => {
    if (a.status === 'PENDENTE' && b.status === 'CONCLUIDO') return -1;
    if (a.status === 'CONCLUIDO' && b.status === 'PENDENTE') return 1;
    return 0;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Agendamentos</h1>
          <p className="mt-1 text-sm text-gray-500">Controle de retornos e contatos.</p>
        </div>
        <div className="flex space-x-3">
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
              {sortedAgendamentos.map((agendamento) => (
                <tr key={agendamento.id} className={agendamento.status === 'CONCLUIDO' ? 'bg-gray-50 opacity-60' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(agendamento.data_agendamento).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {getClienteNome(agendamento.cliente_id)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {agendamento.observacoes}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${agendamento.status === 'CONCLUIDO' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {agendamento.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium print:hidden">
                    <div className="flex justify-end space-x-2">
                      {appUser?.role !== 'MASTER' && agendamento.status === 'PENDENTE' && (
                        <button 
                          onClick={() => handleConcluir(agendamento.id)}
                          className="text-green-600 hover:text-green-900 flex items-center"
                          title="Concluir"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden my-8">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Novo Agendamento</h3>
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
                    <option key={c.id} value={c.id}>{c.nome}</option>
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

              <div className="pt-4 flex justify-end space-x-3 border-t border-gray-200 mt-6">
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
      )}
    </div>
  );
}
