import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { RefreshCw, ShieldAlert } from 'lucide-react';

export default function Configuracoes() {
  const { appUser } = useAuth();
  const [fotoUrl, setFotoUrl] = useState(appUser?.foto_perfil || '');
  const [isSaving, setIsSaving] = useState(false);

  const [isRecalculating, setIsRecalculating] = useState(false);

  const handleRecalcularDebitos = async () => {
    if (!window.confirm('Deseja recalcular o débito de TODOS os clientes com base nas parcelas pendentes? Esta operação pode levar alguns instantes.')) {
      return;
    }

    setIsRecalculating(true);
    try {
      const clientesSnap = await getDocs(collection(db, 'clientes'));
      let totalAtualizados = 0;

      for (const clienteDoc of clientesSnap.docs) {
        const clienteId = clienteDoc.id;
        
        // Buscar todas as parcelas não pagas deste cliente
        const qParcelas = query(
          collection(db, 'parcelas'), 
          where('cliente_id', '==', clienteId),
          where('status', 'in', ['PENDENTE', 'ATRASADO'])
        );
        
        const parcelasSnap = await getDocs(qParcelas);
        const novoDebito = parcelasSnap.docs.reduce((acc, p) => acc + (p.data().valor || 0), 0);

        // Atualizar o débito do cliente
        await updateDoc(doc(db, 'clientes', clienteId), {
          valor_debito: novoDebito
        });
        
        totalAtualizados++;
      }

      alert(`Sucesso! Débitos de ${totalAtualizados} clientes foram recalculados.`);
    } catch (error) {
      console.error("Erro ao recalcular débitos:", error);
      alert('Erro ao recalcular débitos. Verifique o console para detalhes.');
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;
    
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', appUser.id), {
        foto_perfil: fotoUrl
      });
      alert('Perfil atualizado com sucesso! Atualize a página para ver as mudanças.');
    } catch (error) {
      console.error("Error updating profile:", error);
      alert('Erro ao atualizar perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Configurações</h1>
        <p className="mt-1 text-sm text-gray-500">Gerencie suas preferências e perfil.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perfil do Usuário</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-700">
                {appUser?.nome}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-700">
                {appUser?.email}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Conta</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-700">
                {appUser?.role}
              </div>
            </div>

            <Input
              label="URL da Foto de Perfil"
              placeholder="https://exemplo.com/foto.jpg"
              value={fotoUrl}
              onChange={(e) => setFotoUrl(e.target.value)}
            />

            <div className="pt-4">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {appUser?.role === 'MASTER' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-red-600">
                <ShieldAlert className="w-5 h-5 mr-2" />
                Manutenção do Sistema
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-100 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-red-800 mb-1">Recalcular Débitos dos Clientes</h4>
                  <p className="text-xs text-red-600 mb-4">
                    Esta função percorre todos os clientes e atualiza o campo "Valor do Débito" somando todas as parcelas com status PENDENTE ou ATRASADO. Use isso para corrigir inconsistências financeiras.
                  </p>
                  <Button 
                    variant="secondary" 
                    className="bg-white border-red-200 text-red-700 hover:bg-red-50"
                    onClick={handleRecalcularDebitos}
                    disabled={isRecalculating}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isRecalculating ? 'animate-spin' : ''}`} />
                    {isRecalculating ? 'Processando...' : 'Recalcular Todos os Débitos'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configurações Globais (Master)</CardTitle>
            </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              Configurações de comissões globais e parâmetros do sistema.
            </p>
            <form className="space-y-4 max-w-md" onSubmit={(e) => { e.preventDefault(); alert('Funcionalidade em desenvolvimento.'); }}>
              <Input
                label="Comissão Master Padrão (%)"
                type="number"
                defaultValue={10}
              />
              <Input
                label="Comissão Sócio (%)"
                type="number"
                defaultValue={5}
              />
              <div className="pt-4">
                <Button type="submit" variant="secondary">
                  Salvar Configurações Globais
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </>
    )}
  </div>
);
}
