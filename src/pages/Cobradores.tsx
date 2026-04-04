import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

interface Cobrador {
  id: string;
  nome: string;
  email: string;
  tipo_usuario: 'MASTER' | 'COBRADOR';
  ativo: boolean;
  comissao_percentual?: number;
  createdAt: string;
}

export default function Cobradores() {
  const { appUser } = useAuth();
  const [cobradores, setCobradores] = useState<Cobrador[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCobrador, setEditingCobrador] = useState<Cobrador | null>(null);
  const [formData, setFormData] = useState({ 
    nome: '', 
    email: '', 
    comissao_percentual: 0,
    ativo: true 
  });

  useEffect(() => {
    if (appUser?.tipo_usuario !== 'MASTER') return;

    const q = query(collection(db, 'users'), where('tipo_usuario', '==', 'COBRADOR'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cobrador));
      setCobradores(data);
    });

    return () => unsubscribe();
  }, [appUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCobrador) {
        await updateDoc(doc(db, 'users', editingCobrador.id), {
          nome: formData.nome,
          email: formData.email,
          comissao_percentual: formData.comissao_percentual,
          ativo: formData.ativo
        });
      } else {
        await addDoc(collection(db, 'users'), {
          ...formData,
          tipo_usuario: 'COBRADOR',
          createdAt: new Date().toISOString()
        });
      }
      setIsModalOpen(false);
      setEditingCobrador(null);
      setFormData({ nome: '', email: '', comissao_percentual: 0, ativo: true });
    } catch (error) {
      console.error("Error saving cobrador:", error);
      alert("Erro ao salvar cobrador.");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este cobrador?')) {
      try {
        await deleteDoc(doc(db, 'users', id));
      } catch (error) {
        console.error("Error deleting cobrador:", error);
        alert("Erro ao excluir cobrador.");
      }
    }
  };

  if (appUser?.tipo_usuario !== 'MASTER') {
    return <div>Acesso negado.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Cobradores</h1>
          <p className="mt-1 text-sm text-gray-500">Gerenciamento de cobradores do sistema.</p>
        </div>
        <Button onClick={() => {
          setEditingCobrador(null);
          setFormData({ nome: '', email: '', comissao_percentual: 0, ativo: true });
          setIsModalOpen(true);
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Cobrador
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comissão (%)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cobradores.map((cobrador) => (
                <tr key={cobrador.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cobrador.nome}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cobrador.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cobrador.comissao_percentual}%</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${cobrador.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {cobrador.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      onClick={() => {
                        setEditingCobrador(cobrador);
                        setFormData({ 
                          nome: cobrador.nome, 
                          email: cobrador.email, 
                          comissao_percentual: cobrador.comissao_percentual || 0,
                          ativo: cobrador.ativo 
                        });
                        setIsModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(cobrador.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {cobradores.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    Nenhum cobrador cadastrado.
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {editingCobrador ? 'Editar Cobrador' : 'Novo Cobrador'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <Input
                label="Nome do Cobrador"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                required
              />
              <Input
                label="Email (para login)"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
              <Input
                label="Comissão (%)"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.comissao_percentual}
                onChange={(e) => setFormData({ ...formData, comissao_percentual: parseFloat(e.target.value) })}
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
                  Cobrador Ativo
                </label>
              </div>
              <div className="pt-4 flex justify-end space-x-3">
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
