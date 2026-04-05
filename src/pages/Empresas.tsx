import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

interface Empresa {
  id: string;
  nome: string;
  ativo: boolean;
  createdAt: string;
}

export default function Empresas() {
  const { appUser } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [formData, setFormData] = useState({ nome: '', ativo: true });

  useEffect(() => {
    if (appUser?.role !== 'MASTER') return;

    const q = query(collection(db, 'empresas'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Empresa));
      setEmpresas(data);
    });

    return () => unsubscribe();
  }, [appUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEmpresa) {
        await updateDoc(doc(db, 'empresas', editingEmpresa.id), {
          nome: formData.nome,
          ativo: formData.ativo
        });
      } else {
        await addDoc(collection(db, 'empresas'), {
          ...formData,
          createdAt: new Date().toISOString()
        });
      }
      setIsModalOpen(false);
      setEditingEmpresa(null);
      setFormData({ nome: '', ativo: true });
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
          setFormData({ nome: '', ativo: true });
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{empresa.nome}</td>
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
                        setFormData({ nome: empresa.nome, ativo: empresa.ativo });
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-medium text-gray-900">
                {editingEmpresa ? 'Editar Empresa' : 'Nova Empresa'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Nome da Empresa"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                />
                <div className="flex items-center">
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
