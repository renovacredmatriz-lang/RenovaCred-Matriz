import React, { useState, useEffect } from 'react';
import { useAuth, OperationType } from '../contexts/AuthContext';
import { collection, onSnapshot, setDoc, updateDoc, doc, deleteDoc, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db, secondaryAuth } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

interface Cobrador {
  id: string;
  nome: string;
  username: string;
  role: 'MASTER' | 'COBRADOR';
  ativo: boolean;
  comissao_percentual?: number;
  createdAt: string;
}

export default function Cobradores() {
  const { appUser, handlePermissionError } = useAuth();
  const [cobradores, setCobradores] = useState<Cobrador[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCobrador, setEditingCobrador] = useState<Cobrador | null>(null);
  const [formData, setFormData] = useState({ 
    nome: '', 
    username: '', 
    comissao_percentual: 0,
    ativo: true 
  });

  useEffect(() => {
    if (appUser?.role !== 'MASTER') return;

    const q = query(collection(db, 'users'), where('role', '==', 'COBRADOR'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Cobrador))
        .filter((c: any) => c.status !== 'DUPLICADO' && !c.isDeleted);
      setCobradores(data);
    }, (error) => {
      handlePermissionError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, [appUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const usernameLower = formData.username.toLowerCase().trim();
    const internalEmail = `${usernameLower}@app.renovacred.com`;
    
    try {
      // Check for duplicates in Firestore (including inactive/migrated to be safe)
      const qDuplicate = query(collection(db, 'users'), where('username', '==', usernameLower));
      const duplicateSnapshot = await getDocs(qDuplicate);
      const isDuplicate = duplicateSnapshot.docs.some(
        doc => doc.id !== editingCobrador?.id
      );
      
      if (isDuplicate) {
        alert('Este usuário já existe. Escolha outro username.');
        return;
      }

      const batch = writeBatch(db);

      if (editingCobrador) {
        const userRef = doc(db, 'users', editingCobrador.id);
        batch.update(userRef, {
          nome: formData.nome,
          comissao_percentual: formData.comissao_percentual,
          ativo: formData.ativo
        });
        
        await batch.commit();
      } else {
        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, internalEmail, '123456');
          const uid = userCredential.user.uid;

          await setDoc(doc(db, 'users', uid), {
            uid: uid,
            nome: formData.nome,
            username: usernameLower,
            email: internalEmail,
            role: 'COBRADOR',
            ativo: formData.ativo,
            comissao_percentual: formData.comissao_percentual,
            primeiroAcesso: true,
            createdAt: new Date().toISOString()
          });
          
          await secondaryAuth.signOut();
        } catch (authError: any) {
          if (authError.code === 'auth/email-already-in-use') {
            alert('Este usuário já está cadastrado. Utilize outro username.');
            return;
          } else {
            throw authError;
          }
        }
      }
      
      setIsModalOpen(false);
      setEditingCobrador(null);
      setFormData({ nome: '', username: '', comissao_percentual: 0, ativo: true });
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

  if (appUser?.role !== 'MASTER') {
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
          setFormData({ nome: '', username: '', comissao_percentual: 0, ativo: true });
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comissão (%)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cobradores.map((cobrador) => (
                <tr key={cobrador.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cobrador.nome}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cobrador.username}</td>
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
                          username: cobrador.username || '', 
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-medium text-gray-900">
                {editingCobrador ? 'Editar Cobrador' : 'Novo Cobrador'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Nome do Cobrador"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                />
                <Input
                  label="Username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  disabled={!!editingCobrador}
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
