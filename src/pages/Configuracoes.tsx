import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, updateDoc, collection, getDocs, query, where, writeBatch, limit, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { RefreshCw, ShieldAlert, Trash2, X, AlertTriangle } from 'lucide-react';

export default function Configuracoes() {
  const { appUser } = useAuth();
  const [fotoUrl, setFotoUrl] = useState(appUser?.foto_perfil || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingGlobals, setIsSavingGlobals] = useState(false);

  const [comissaoMaster, setComissaoMaster] = useState<number>(10);
  const [comissaoSocio, setComissaoSocio] = useState<number>(5);

  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetProgress, setResetProgress] = useState('');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const [isMigratingOldData, setIsMigratingOldData] = useState(false);
  const [migrateProgress, setMigrateProgress] = useState('');

  useEffect(() => {
    if (appUser?.role !== 'MASTER') return;
    const fetchGlobalSettings = async () => {
      try {
        const configDoc = await getDoc(doc(db, 'auxData', 'configGlobal'));
        if (configDoc.exists()) {
          const data = configDoc.data();
          if (data.comissao_master !== undefined) setComissaoMaster(data.comissao_master);
          if (data.comissao_socio !== undefined) setComissaoSocio(data.comissao_socio);
        }
      } catch (error) {
        console.error("Erro ao carregar configurações globais:", error);
      }
    };
    fetchGlobalSettings();
  }, [appUser]);

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (appUser?.role !== 'MASTER') return;
    
    setIsSavingGlobals(true);
    try {
      await setDoc(doc(db, 'auxData', 'configGlobal'), {
        comissao_master: Number(comissaoMaster),
        comissao_socio: Number(comissaoSocio),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      alert('Configurações salvas com sucesso!');
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      alert('Erro ao salvar as configurações. Verifique sua conexão e permissões.');
    } finally {
      setIsSavingGlobals(false);
    }
  };

  const handleResetBaseDados = async () => {
    if (confirmText !== 'CONFIRMAR') {
      alert('Por favor, digite CONFIRMAR para prosseguir.');
      return;
    }

    setIsResetting(true);
    setIsResetModalOpen(false);
    setConfirmText('');

    const colecoesParaLimpar = [
      'movimentacoes',
      'parcelas',
      'negociacoes',
      'agendamentos',
      'clientes'
    ];

    try {
      for (const collName of colecoesParaLimpar) {
        setResetProgress(`Limpando coleção: ${collName}...`);
        
        while (true) {
          const q = query(collection(db, collName), limit(500));
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) break;

          const batch = writeBatch(db);
          snapshot.docs.forEach(doc => batch.delete(doc.ref));
          
          await batch.commit();
          
          // Pausa de 100ms entre batches para evitar sobrecarga
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      setResetProgress('');
      alert('Base de dados resetada com sucesso! (Apenas dados operacionais foram removidos)');
    } catch (error) {
      console.error("Erro ao resetar base de dados:", error);
      alert('Erro ao resetar base de dados. Verifique o console.');
      setResetProgress('');
    } finally {
      setIsResetting(false);
    }
  };

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

  const handleMigrateData = async () => {
    if (!window.confirm("Isso irá atualizar documentos antigos nas coleções de movimentações, negociações e parcelas para incluir o cobrador_id onde falta. Continuar?")) return;
    
    setIsMigratingOldData(true);
    setMigrateProgress('Carregando empresas...');
    try {
      const empSnap = await getDocs(collection(db, 'empresas'));
      const empresaToCobrador: Record<string, string> = {};
      empSnap.docs.forEach(d => {
        empresaToCobrador[d.id] = d.data().cobradorId || '';
      });

      setMigrateProgress('Buscando negociações...');
      const negSnap = await getDocs(collection(db, 'negociacoes'));
      const negociacaoToCobrador: Record<string, string> = {};
      
      let batch = writeBatch(db);
      let opCount = 0;
      let totalUpdated = 0;

      const commitBatch = async () => {
        if (opCount > 0) {
          await batch.commit();
          totalUpdated += opCount;
          batch = writeBatch(db);
          opCount = 0;
          await new Promise(r => setTimeout(r, 100)); // Rate limit 
        }
      };

      for (const d of negSnap.docs) {
        const data = d.data();
        let cid = data.cobrador_id;
        
        if (!cid && data.empresaId) {
          const expectedCid = empresaToCobrador[data.empresaId];
          if (expectedCid) {
            batch.update(d.ref, { cobrador_id: expectedCid });
            opCount++;
            cid = expectedCid;
          }
        }
        
        if (cid) {
          negociacaoToCobrador[d.id] = cid;
        }

        if (opCount >= 400) await commitBatch();
      }
      await commitBatch();

      setMigrateProgress('Filtrando e atualizando movimentações...');
      const movSnap = await getDocs(collection(db, 'movimentacoes'));
      for (const d of movSnap.docs) {
        const data = d.data();
        if (!data.cobrador_id && data.empresaId) {
          const expectedCid = empresaToCobrador[data.empresaId];
          if (expectedCid) {
            batch.update(d.ref, { cobrador_id: expectedCid });
            opCount++;
          }
        }
        if (opCount >= 400) await commitBatch();
      }
      await commitBatch();

      setMigrateProgress('Filtrando e atualizando parcelas...');
      const parSnap = await getDocs(collection(db, 'parcelas'));
      for (const d of parSnap.docs) {
        const data = d.data();
        if (!data.cobrador_id && data.negociacao_id) {
          const expectedCid = negociacaoToCobrador[data.negociacao_id];
          if (expectedCid) {
            batch.update(d.ref, { cobrador_id: expectedCid });
            opCount++;
          }
        }
        if (opCount >= 400) await commitBatch();
      }
      await commitBatch();

      alert(`Migração concluída com sucesso! Documentos atualizados: ${totalUpdated}`);
      console.log(`Migração: ${totalUpdated} documentos foram atualizados.`);
    } catch (error) {
      console.error("Erro na migração:", error);
      alert("Erro na migração. Verifique o console.");
    } finally {
      setIsMigratingOldData(false);
      setMigrateProgress('');
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
                    disabled={isRecalculating || isResetting || isMigratingOldData}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isRecalculating ? 'animate-spin' : ''}`} />
                    {isRecalculating ? 'Processando...' : 'Recalcular Todos os Débitos'}
                  </Button>
                </div>

                <div className="bg-orange-50 border border-orange-100 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-orange-800 mb-1">Migração de Dados (Cobrador)</h4>
                  <p className="text-xs text-orange-600 mb-4">
                    Atualiza documentos antigos (negociacões, movimentações e parcelas) para incluir o campo <code className="bg-orange-100 px-1 rounded">cobrador_id</code> usando o vínculo atual da empresa.
                  </p>
                  <Button 
                    variant="secondary" 
                    className="bg-white border-orange-200 text-orange-700 hover:bg-orange-50"
                    onClick={handleMigrateData}
                    disabled={isRecalculating || isResetting || isMigratingOldData}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isMigratingOldData ? 'animate-spin' : ''}`} />
                    {isMigratingOldData ? 'Migrando...' : 'Corrigir Dados Antigos (cobrador_id)'}
                  </Button>
                  {isMigratingOldData && (
                    <p className="mt-2 text-xs font-medium text-orange-800 animate-pulse">
                      {migrateProgress}
                    </p>
                  )}
                </div>

                <div className="bg-red-100 border border-red-200 p-4 rounded-lg">
                  <h4 className="text-sm font-bold text-red-900 mb-1 flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    Resetar Base de Dados
                  </h4>
                  <p className="text-xs text-red-700 mb-4">
                    ATENÇÃO: Esta ação excluirá permanentemente todos os clientes, negociações, parcelas, movimentações e agendamentos. Os usuários e configurações não serão afetados.
                  </p>
                  <Button 
                    variant="danger" 
                    onClick={() => setIsResetModalOpen(true)}
                    disabled={isResetting || isRecalculating || isMigratingOldData}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Resetar Base de Dados
                  </Button>
                  {isResetting && (
                    <p className="mt-2 text-xs font-medium text-red-800 animate-pulse">
                      {resetProgress}
                    </p>
                  )}
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
            <form className="space-y-4 max-w-md" onSubmit={handleSaveGlobalSettings}>
              <Input
                label="Comissão Master Padrão (%)"
                type="number"
                value={comissaoMaster}
                onChange={(e) => setComissaoMaster(Number(e.target.value))}
                min="0"
                max="100"
                step="0.01"
              />
              <Input
                label="Comissão Sócio (%)"
                type="number"
                value={comissaoSocio}
                onChange={(e) => setComissaoSocio(Number(e.target.value))}
                min="0"
                max="100"
                step="0.01"
              />
              <div className="pt-4">
                <Button type="submit" variant="secondary" disabled={isSavingGlobals}>
                  {isSavingGlobals ? 'Salvando...' : 'Salvar Configurações Globais'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </>
    )}

    {/* Modal de Confirmação de Reset */}
    {isResetModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-red-600 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Confirmar Reset Total
            </h3>
            <button onClick={() => setIsResetModalOpen(false)} className="text-gray-400 hover:text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <p className="text-sm text-gray-600 mb-6">
            Esta ação é <strong>irreversível</strong>. Todos os dados operacionais (clientes, negociações, parcelas, etc.) serão excluídos permanentemente.
          </p>
          
          <div className="space-y-4">
            <p className="text-xs font-medium text-gray-700">
              Para confirmar, digite <strong>CONFIRMAR</strong> abaixo:
            </p>
            <Input
              placeholder="Digite CONFIRMAR"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
            
            <div className="flex space-x-3 pt-2">
              <Button 
                variant="secondary" 
                className="flex-1"
                onClick={() => {
                  setIsResetModalOpen(false);
                  setConfirmText('');
                }}
              >
                Cancelar
              </Button>
              <Button 
                variant="danger" 
                className="flex-1"
                onClick={handleResetBaseDados}
                disabled={confirmText !== 'CONFIRMAR'}
              >
                Resetar Agora
              </Button>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
);
}
