import React, { useState, useEffect } from 'react';
import { useAuth, OperationType } from '../contexts/AuthContext';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, orderBy, where, getDocs, setDoc } from 'firebase/firestore';
import { db, secondaryAuth } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

interface Empresa {
  id: string;
  nome: string; // Legado
  nomeFantasia?: string;
  razaoSocial?: string;
  cnpj?: string;
  inscricaoEstadual?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  telefone1?: string;
  telefone2?: string;
  email?: string;
  proprietario?: string;
  nomeContato?: string;
  ativo: boolean;
  cobradorId?: string;
  createdAt: string;
}

const formatCNPJ = (v: string) => {
  v = v.replace(/\D/g, "");
  if (v.length > 14) v = v.substring(0, 14);
  if (v.length <= 2) return v;
  if (v.length <= 5) return v.replace(/^(\d{2})(\d)/, "$1.$2");
  if (v.length <= 8) return v.replace(/^(\d{2})(\d{3})(\d)/, "$1.$2.$3");
  if (v.length <= 12) return v.replace(/^(\d{2})(\d{3})(\d{3})(\d)/, "$1.$2.$3/$4");
  return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d)/, "$1.$2.$3/$4-$5");
};

const formatCEP = (v: string) => {
  v = v.replace(/\D/g, "");
  if (v.length > 8) v = v.substring(0, 8);
  return v.replace(/^(\d{5})(\d)/, "$1-$2");
};

const formatPhone = (v: string) => {
  v = v.replace(/\D/g, "");
  if (v.length > 11) v = v.substring(0, 11);
  if (v.length > 10) {
    return v.replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  if (v.length > 2) {
    return v.replace(/^(\d{2})(\d)/, "($1) $2");
  }
  return v;
};

const validateCNPJ = (cnpj: string) => {
  cnpj = cnpj.replace(/[^\d]+/g, '');
  if (cnpj === '') return false;
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  let size = cnpj.length - 2;
  let numbers = cnpj.substring(0, size);
  let digits = cnpj.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  size = size + 1;
  numbers = cnpj.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
};

interface Cobrador {
  id: string;
  nome: string;
  email: string;
  uid?: string;
}

export default function Empresas() {
  const { appUser, handlePermissionError } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cobradores, setCobradores] = useState<Cobrador[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [formData, setFormData] = useState({
    nomeFantasia: '',
    razaoSocial: '',
    cnpj: '',
    inscricaoEstadual: '',
    endereco: '',
    numero: '',
    bairro: '',
    cep: '',
    cidade: '',
    estado: '',
    telefone1: '',
    telefone2: '',
    email: '',
    proprietario: '',
    nomeContato: '',
    ativo: true,
    cobradorId: ''
  });

  const resetForm = () => {
    setFormData({
      nomeFantasia: '',
      razaoSocial: '',
      cnpj: '',
      inscricaoEstadual: '',
      endereco: '',
      numero: '',
      bairro: '',
      cep: '',
      cidade: '',
      estado: '',
      telefone1: '',
      telefone2: '',
      email: '',
      proprietario: '',
      nomeContato: '',
      ativo: true,
      cobradorId: ''
    });
  };

  useEffect(() => {
    if (appUser?.role !== 'MASTER') return;

    const fetchCobradores = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'COBRADOR'));
        const snapshot = await getDocs(q);
        const validCobradores = snapshot.docs
          .filter(doc => doc.data().status !== 'DUPLICADO' && !doc.data().isDeleted && doc.data().status !== 'PENDENTE' && doc.data().status !== 'MIGRADO' && doc.data().uid)
          .map(doc => ({ id: doc.id, nome: doc.data().nome, email: doc.data().email, uid: doc.data().uid }));
        setCobradores(validCobradores);
      } catch (error) {
        handlePermissionError(error, OperationType.LIST, 'users');
      }
    };
    fetchCobradores();

    const q = query(collection(db, 'empresas'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Empresa));
      setEmpresas(data);
    }, (error) => {
      handlePermissionError(error, OperationType.LIST, 'empresas');
    });

    return () => unsubscribe();
  }, [appUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Normalização
    const normalizedData = {
      ...formData,
      nomeFantasia: formData.nomeFantasia.trim(),
      razaoSocial: formData.razaoSocial.trim(),
      cnpj: formData.cnpj.replace(/\D/g, ""),
      inscricaoEstadual: formData.inscricaoEstadual.trim(),
      endereco: formData.endereco.trim(),
      numero: formData.numero.trim(),
      bairro: formData.bairro.trim(),
      cep: formData.cep.replace(/\D/g, ""),
      cidade: formData.cidade.trim(),
      estado: formData.estado.trim(),
      telefone1: formData.telefone1.replace(/\D/g, ""),
      telefone2: formData.telefone2.replace(/\D/g, ""),
      email: formData.email.trim().toLowerCase(),
      proprietario: formData.proprietario.trim(),
      nomeContato: formData.nomeContato.trim(),
    };

    if (!normalizedData.nomeFantasia || !normalizedData.cnpj || !normalizedData.nomeContato || !normalizedData.cobradorId) {
      alert("Por favor, preencha todos os campos obrigatórios (Nome Fantasia, CNPJ, Nome para Contato e Cobrador Vinculado).");
      return;
    }

    // Validação apenas para novos cadastros ou se preenchido
    if (!editingEmpresa) {
      if (!validateCNPJ(normalizedData.cnpj)) {
        alert("CNPJ inválido.");
        return;
      }
    } else {
      // Se estiver editando e o CNPJ foi alterado, valida
      if (normalizedData.cnpj && normalizedData.cnpj !== editingEmpresa.cnpj?.replace(/\D/g, "")) {
        if (!validateCNPJ(normalizedData.cnpj)) {
          alert("CNPJ inválido.");
          return;
        }
      }
    }

    try {
      if (editingEmpresa) {
        await updateDoc(doc(db, 'empresas', editingEmpresa.id), {
          ...normalizedData,
          // Mantém o campo 'nome' legado se já existir, mas não o atualiza automaticamente
        });
      } else {
        const empresaRef = await addDoc(collection(db, 'empresas'), {
          ...normalizedData,
          createdAt: new Date().toISOString()
        });

        // Criar usuário CREDOR automaticamente
        try {
          const username = normalizedData.cnpj;
          const internalEmail = `${username}@app.renovacred.com`;
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, internalEmail, '123456');
          await secondaryAuth.signOut();

          await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            username: username,
            nome: normalizedData.nomeFantasia,
            email: internalEmail, // e-mail do sistema para login
            emailContato: normalizedData.email, // e-mail real da empresa
            role: 'CREDOR',
            ativo: true,
            empresaId: empresaRef.id,
            primeiroAcesso: true,
            createdAt: new Date().toISOString()
          });
        } catch (authError) {
          console.error("Erro ao criar usuário credor:", authError);
          alert("A empresa foi criada, mas houve um erro ao criar o usuário de acesso do credor. Verifique o CNPJ.");
        }
      }
      setIsModalOpen(false);
      setEditingEmpresa(null);
      resetForm();
    } catch (error) {
      console.error("Error saving empresa:", error);
      alert("Erro ao salvar empresa.");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta empresa?')) {
      try {
        await deleteDoc(doc(db, 'empresas', id));
      } catch (error) {
        console.error("Error deleting empresa:", error);
        alert("Erro ao excluir empresa.");
      }
    }
  };

  if (appUser?.role !== 'MASTER') {
    return <div>Acesso negado. Apenas MASTER pode acessar esta página.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Empresas</h1>
          <p className="mt-1 text-sm text-gray-500">Gerenciamento de empresas cadastradas.</p>
        </div>
        <Button onClick={() => {
          setEditingEmpresa(null);
          resetForm();
          setIsModalOpen(true);
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Empresa
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data Cadastro</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {empresas.map((empresa) => (
                <tr key={empresa.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {empresa.nomeFantasia || empresa.nome}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${empresa.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {empresa.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(empresa.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      onClick={() => {
                        setEditingEmpresa(empresa);
                        setFormData({ 
                          nomeFantasia: empresa.nomeFantasia || '',
                          razaoSocial: empresa.razaoSocial || '',
                          cnpj: empresa.cnpj || '',
                          inscricaoEstadual: empresa.inscricaoEstadual || '',
                          endereco: empresa.endereco || '',
                          numero: empresa.numero || '',
                          bairro: empresa.bairro || '',
                          cep: empresa.cep || '',
                          cidade: empresa.cidade || '',
                          estado: empresa.estado || '',
                          telefone1: empresa.telefone1 || '',
                          telefone2: empresa.telefone2 || '',
                          email: empresa.email || '',
                          proprietario: empresa.proprietario || '',
                          nomeContato: empresa.nomeContato || '',
                          ativo: empresa.ativo,
                          cobradorId: empresa.cobradorId || ''
                        });
                        setIsModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(empresa.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {empresas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                    Nenhuma empresa cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-medium text-gray-900">
                {editingEmpresa ? 'Editar Empresa' : 'Nova Empresa'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Seção 1: Identificação */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-blue-100 pb-1">
                    🏢 Identificação da Empresa
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Nome Fantasia"
                      value={formData.nomeFantasia}
                      onChange={(e) => setFormData({ ...formData, nomeFantasia: e.target.value })}
                      required={!editingEmpresa}
                    />
                    <Input
                      label="Razão Social"
                      value={formData.razaoSocial}
                      onChange={(e) => setFormData({ ...formData, razaoSocial: e.target.value })}
                    />
                    <Input
                      label="CNPJ"
                      value={formatCNPJ(formData.cnpj)}
                      onChange={(e) => setFormData({ ...formData, cnpj: e.target.value.replace(/\D/g, "") })}
                      required={!editingEmpresa}
                      placeholder="00.000.000/0000-00"
                    />
                    <Input
                      label="Inscrição Estadual"
                      value={formData.inscricaoEstadual}
                      onChange={(e) => setFormData({ ...formData, inscricaoEstadual: e.target.value })}
                    />
                  </div>
                </div>

                {/* Seção 2: Localização */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-blue-100 pb-1">
                    📍 Localização
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                      <Input
                        label="CEP"
                        value={formatCEP(formData.cep)}
                        onChange={(e) => setFormData({ ...formData, cep: e.target.value.replace(/\D/g, "") })}
                        placeholder="00000-000"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Input
                        label="Endereço"
                        value={formData.endereco}
                        onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                      />
                    </div>
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
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label="Cidade"
                        value={formData.cidade}
                        onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                      />
                      <Input
                        label="Estado"
                        value={formData.estado}
                        onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                        maxLength={2}
                        placeholder="UF"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 3: Contato */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-blue-100 pb-1">
                    📞 Informações de Contato
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Telefone 1"
                      value={formatPhone(formData.telefone1)}
                      onChange={(e) => setFormData({ ...formData, telefone1: e.target.value.replace(/\D/g, "") })}
                      placeholder="(00) 00000-0000"
                    />
                    <Input
                      label="Telefone 2"
                      value={formatPhone(formData.telefone2)}
                      onChange={(e) => setFormData({ ...formData, telefone2: e.target.value.replace(/\D/g, "") })}
                      placeholder="(00) 00000-0000"
                    />
                    <Input
                      label="E-mail"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                    <Input
                      label="Proprietário"
                      value={formData.proprietario}
                      onChange={(e) => setFormData({ ...formData, proprietario: e.target.value })}
                    />
                    <Input
                      label="Nome para Contato"
                      value={formData.nomeContato}
                      onChange={(e) => setFormData({ ...formData, nomeContato: e.target.value })}
                      required={!editingEmpresa}
                    />
                    <div className="flex items-center pt-8">
                      <input
                        type="checkbox"
                        id="ativo"
                        checked={formData.ativo}
                        onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="ativo" className="ml-2 block text-sm text-gray-900">
                        Empresa Ativa
                      </label>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cobrador Vinculado <span className="text-red-500">*</span></label>
                  <select
                    className="mt-1 block w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    value={formData.cobradorId}
                    onChange={(e) => setFormData({ ...formData, cobradorId: e.target.value })}
                    required
                  >
                    <option value="">Selecione um cobrador</option>
                    {cobradores.map(cobrador => {
                      if (!cobrador.uid) return null;
                      return (
                        <option key={cobrador.id} value={cobrador.uid}>
                          {cobrador.nome} ({cobrador.email})
                        </option>
                      );
                    })}
                  </select>
                  {cobradores.length === 0 && (
                    <p className="mt-2 text-sm text-gray-500">Nenhum cobrador encontrado.</p>
                  )}
                </div>

                <div className="pt-4 flex justify-end space-x-3 mt-6 shrink-0 border-t border-gray-200">
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
