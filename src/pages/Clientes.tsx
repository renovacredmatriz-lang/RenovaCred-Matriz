import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, OperationType } from '../contexts/AuthContext';
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
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  telefone1: string;
  telefone2?: string;
  cpf?: string;
  numeroTitulos?: string;
  valor_debito: number;
  createdAt: string;
  uid?: string;
}

interface Empresa {
  id: string;
  nome: string;
  nomeFantasia?: string;
}

export default function Clientes() {
  const { appUser, currentUser, handlePermissionError } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [filterCodigo, setFilterCodigo] = useState('');
  const [filterNome, setFilterNome] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [historicoCliente, setHistoricoCliente] = useState<Cliente | null>(null);
  
  const [formData, setFormData] = useState({
    codigo: '',
    nome: '',
    endereco: '',
    numero: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: '',
    telefone1: '',
    telefone2: '',
    cpf: '',
    numeroTitulos: '',
    valor_debito: 0,
  });

  useEffect(() => {
    let qEmpresas = query(collection(db, 'empresas'));
    if (appUser?.role === 'COBRADOR') {
      qEmpresas = query(collection(db, 'empresas'), where('cobradorId', '==', appUser.uid));
    }
    const unsubEmpresas = onSnapshot(qEmpresas, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Empresa));
      setEmpresas(data);
    }, (error) => {
      handlePermissionError(error, OperationType.LIST, 'empresas');
    });

    return () => unsubEmpresas();
  }, [appUser]);

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
    }, (error) => {
      handlePermissionError(error, OperationType.LIST, 'clientes');
    });

    return () => {
      unsubClientes();
    };
  }, [selectedEmpresa]);

  const getEmpresaNome = (empresaId: string) => {
    const empresa = empresas.find(e => e.id === empresaId);
    return empresa?.nomeFantasia || empresa?.nome || 'Empresa não encontrada';
  };

  const filteredClientes = useMemo(() => {
    return clientes.filter(cliente => {
      const matchCodigo = (cliente.codigo || '').toLowerCase().includes(filterCodigo.toLowerCase());
      const matchNome = (cliente.nome || '').toLowerCase().includes(filterNome.toLowerCase());
      return matchCodigo && matchNome;
    });
  }, [clientes, filterCodigo, filterNome]);

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
        codigo: formData.codigo,
        nome: formData.nome,
        endereco: formData.endereco,
        ...(formData.numero ? { numero: formData.numero } : {}),
        ...(formData.bairro ? { bairro: formData.bairro } : {}),
        ...(formData.cidade ? { cidade: formData.cidade } : {}),
        ...(formData.estado ? { estado: formData.estado } : {}),
        ...(formData.cep ? { cep: formData.cep } : {}),
        telefone1: formData.telefone1,
        ...(formData.telefone2 ? { telefone2: formData.telefone2 } : {}),
        ...(formData.cpf ? { cpf: formData.cpf } : {}),
        ...(formData.numeroTitulos ? { numeroTitulos: formData.numeroTitulos } : {}),
        valor_debito: formData.valor_debito,
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
      numero: '',
      bairro: '',
      cidade: '',
      estado: '',
      cep: '',
      telefone1: '',
      telefone2: '',
      cpf: '',
      numeroTitulos: '',
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <Input
          placeholder="Buscar por Código"
          value={filterCodigo}
          onChange={(e) => setFilterCodigo(e.target.value)}
        />
        <Input
          placeholder="Buscar por Nome"
          value={filterNome}
          onChange={(e) => setFilterNome(e.target.value)}
        />
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
              {filteredClientes.map((cliente) => (
                <tr key={cliente.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cliente.codigo}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cliente.nome}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getEmpresaNome(cliente.empresaId)}</td>
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
                              codigo: cliente.codigo || '',
                              nome: cliente.nome || '',
                              endereco: cliente.endereco || '',
                              numero: cliente.numero || '',
                              bairro: cliente.bairro || '',
                              cidade: cliente.cidade || '',
                              estado: cliente.estado || '',
                              cep: cliente.cep || '',
                              telefone1: cliente.telefone1 || '',
                              telefone2: cliente.telefone2 || '',
                              cpf: cliente.cpf || '',
                              numeroTitulos: cliente.numeroTitulos || '',
                              valor_debito: cliente.valor_debito || 0,
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
              {filteredClientes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                    Nenhum cliente encontrado.
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

                  <Input
                    label="CPF (Opcional)"
                    type="text"
                    placeholder="000.000.000-00"
                    value={formData.cpf}
                    onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
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
                    <h4 className="text-sm font-medium text-gray-900 border-b pb-2 mb-2">Localização</h4>
                  </div>
                  
                  <Input
                    label="CEP"
                    value={formData.cep}
                    onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                  />
                  <Input
                    label="Endereço"
                    value={formData.endereco}
                    onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                    required
                  />

                  <Input
                    label="Número"
                    value={formData.numero}
                    onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                  />
                  <Input
                    label="Bairro"
                    value={formData.bairro}
                    onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                  />

                  <Input
                    label="Cidade"
                    value={formData.cidade}
                    onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                  />
                  <Input
                    label="Estado"
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                  />

                  <div className="md:col-span-2 mt-4">
                    <h4 className="text-sm font-medium text-gray-900 border-b pb-2 mb-2">Contato e Financeiro</h4>
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
                    label="Nº dos Títulos (Ex: 1010/2255/8877)"
                    value={formData.numeroTitulos}
                    onChange={(e) => setFormData({ ...formData, numeroTitulos: e.target.value })}
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
