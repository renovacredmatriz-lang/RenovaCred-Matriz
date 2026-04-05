import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, orderBy, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, Edit2, Trash2, X, History } from 'lucide-react';
import { ClienteHistoricoModal } from '../components/ClienteHistoricoModal';
import { logAction } from '../utils/auditLogger';

interface Cliente {
  id: string;
  codigo: string;
  empresaId: string;
  nome: string;
  endereco: string;
  telefone1: string;
  telefone2?: string;
  valor_debito: number;
  createdAt: string;
  uid?: string;
}

interface Empresa {
  id: string;
  nome: string;
}

export default function Clientes() {
  const { appUser, currentUser } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [historicoCliente, setHistoricoCliente] = useState<Cliente | null>(null);
  
  const [formData, setFormData] = useState({
    codigo: '',
    nome: '',
    endereco: '',
    telefone1: '',
    telefone2: '',
    valor_debito: 0,
  });

  useEffect(() => {
    let qClientes;
    if (appUser?.role === 'MASTER') {
      qClientes = query(collection(db, 'clientes'), orderBy('createdAt', 'desc'));
    } else {
      if (!selectedEmpresa) return;
      qClientes = query(collection(db, 'clientes'), where('empresaId', '==', selectedEmpresa.id), orderBy('createdAt', 'desc'));
    }
    
    const unsubClientes = onSnapshot(qClientes, (snapshot) => {
      const validClientes = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Cliente))
        .filter(c => c.empresaId); // Filter out invalid documents
      setClientes(validClientes);
    });

    return () => {
      unsubClientes();
    };
  }, [selectedEmpresa]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedEmpresa) {
      alert("Selecione uma empresa antes de continuar");
      return;
    }

    if (!currentUser?.uid) {
      alert("Usuário não autenticado corretamente.");
      return;
    }

    if (appUser?.role === 'MASTER') {
      alert("Usuários MASTER não podem criar ou editar clientes.");
      return;
    }

    try {
      // Check for duplicate code in the same company
      const isDuplicate = clientes.some(c => 
        c.codigo === formData.codigo && 
        c.empresaId === selectedEmpresa.id && 
        c.id !== editingCliente?.id
      );

      if (isDuplicate) {
        alert("Já existe um cliente com este código nesta empresa.");
        return;
      }

      const payload = {
        ...formData,
        empresaId: selectedEmpresa.id,
        uid: currentUser.uid
      };

      console.log("AUTH USER:", currentUser);
      console.log("APP USER:", appUser);
      console.log("EMPRESA:", selectedEmpresa);
      console.log("PAYLOAD FINAL:", payload);

      if (editingCliente) {
        await updateDoc(doc(db, 'clientes', editingCliente.id), payload);
        logAction(appUser, 'EDITAR_CLIENTE', 'cliente', editingCliente.id, payload);
      } else {
        const docRef = await addDoc(collection(db, 'clientes'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        logAction(appUser, 'CRIAR_CLIENTE', 'cliente', docRef.id, payload);
      }
      setIsModalOpen(false);
      setEditingCliente(null);
      resetForm();
    } catch (error: any) {
      console.error("Error saving cliente:", error);
      alert("Erro ao salvar cliente: " + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      codigo: '',
      nome: '',
      endereco: '',
      telefone1: '',
      telefone2: '',
      valor_debito: 0,
    });
  };

  const handleDelete = async (cliente: Cliente) => {
    if (!window.confirm("Tem certeza que deseja excluir este cliente?")) return;
    
    try {
      const qNeg = query(collection(db, 'negociacoes'), where('cliente_id', '==', cliente.id));
      const snap = await getDocs(qNeg);
      if (!snap.empty) {
        alert("Não é possível excluir este cliente pois existem negociações vinculadas a ele.");
        return;
      }

      await deleteDoc(doc(db, 'clientes', cliente.id));
      logAction(appUser, 'EXCLUIR_CLIENTE', 'cliente', cliente.id, { nome: cliente.nome });
      alert("Cliente excluído com sucesso!");
    } catch (error: any) {
      console.error("Erro ao excluir cliente:", error);
      alert("Erro ao excluir cliente: " + error.message);
    }
  };

  const openNewModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Clientes</h1>
          <p className="mt-1 text-sm text-gray-500">Gerenciamento de clientes</p>
        </div>
        {appUser?.role !== 'MASTER' && (
          <Button onClick={openNewModal}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Cliente
          </Button>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telefone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Débito</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {clientes.map((cliente) => (
                <tr key={cliente.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cliente.codigo}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cliente.nome}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{selectedEmpresa?.nome}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cliente.telefone1}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cliente.valor_debito)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      onClick={() => setHistoricoCliente(cliente)}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                      title="Ver Histórico"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    {appUser?.role !== 'MASTER' && (
                      <>
                        <button 
                          onClick={() => {
                            setEditingCliente(cliente);
                            setFormData({
                              codigo: cliente.codigo,
                              nome: cliente.nome,
                              endereco: cliente.endereco,
                              telefone1: cliente.telefone1,
                              telefone2: cliente.telefone2 || '',
                              valor_debito: cliente.valor_debito,
                            });
                            setIsModalOpen(true);
                          }}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(cliente)}
                          className="text-red-600 hover:text-red-900"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                    Nenhum cliente cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Historico */}
      {historicoCliente && (
        <ClienteHistoricoModal 
          cliente={historicoCliente} 
          onClose={() => setHistoricoCliente(null)} 
        />
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-medium text-gray-900">
                {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Código do Cliente"
                    value={formData.codigo}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                    required
                  />
                  
                  <div className="md:col-span-2">
                    <Input
                      label="Nome Completo"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Input
                      label="Endereço"
                      value={formData.endereco}
                      onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                      required
                    />
                  </div>

                  <Input
                    label="Telefone 1"
                    value={formData.telefone1}
                    onChange={(e) => setFormData({ ...formData, telefone1: e.target.value })}
                    required
                  />
                  <Input
                    label="Telefone 2 (Opcional)"
                    value={formData.telefone2}
                    onChange={(e) => setFormData({ ...formData, telefone2: e.target.value })}
                  />

                  <Input
                    label="Valor do Débito (R$)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.valor_debito}
                    onChange={(e) => setFormData({ ...formData, valor_debito: parseFloat(e.target.value) })}
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
    </div>
  );
}
