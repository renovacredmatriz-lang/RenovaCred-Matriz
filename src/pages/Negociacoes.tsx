import React, { useState, useEffect } from 'react';
import { useAuth, OperationType } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
import { collection, onSnapshot, query, orderBy, runTransaction, doc, where, getDocs, setDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Plus, X, RotateCcw, DollarSign, CheckCircle, Handshake } from 'lucide-react';
import { logAction } from '../utils/auditLogger';

interface Negociacao {
  id: string;
  cliente_id: string;
  clienteNome?: string;
  empresaId: string;
  cobrador_id: string;
  uid?: string;
  numeroTitulo: string;
  tipo: 'QUITACAO' | 'PARCELAMENTO' | 'PARCELA' | 'RESGATE' | 'ENTRADA';
  valor: number;
  valorTotal?: number;
  valorDebito?: number;
  valor_entrada?: number;
  numero_parcelas?: number;
  tipoJuros?: string;
  valorJuros?: number;
  observacoes?: string;
  parcela_id?: string;
  numero_parcela?: number;
  status: 'ATIVO' | 'ESTORNADO' | 'QUITADO' | 'FINALIZADO' | 'PAGO';
  createdAt: string;
  parcelas_pagas?: number;
  titulo_id?: string;
}

interface Cliente {
  id: string;
  codigo: string;
  nome: string;
  valor_debito: number;
  empresaId: string;
  numeroTitulos?: string;
}

interface ParcelaGerada {
  numero: number;
  valor: number;
  vencimento: string;
  tipo_parcela: 'ENTRADA' | 'PARCELA';
}

interface ParcelaAberta {
  id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  negociacao_id: string;
  status: string;
  tipo_parcela?: string;
}

export default function Negociacoes() {
  const { appUser, currentUser, handlePermissionError } = useAuth();
  const { selectedEmpresa } = useEmpresa();
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    codigoCliente: '',
    cliente_id: '',
    clienteNome: '',
    numeroTitulo: '',
    valorDebito: 0,
    tipo: 'QUITACAO' as 'QUITACAO' | 'PARCELAMENTO' | 'PARCELA' | 'RESGATE',
    valorTotal: 0,
    valor_entrada: 0,
    numero_parcelas: 1,
    tipoJuros: 'NENHUM',
    valorJuros: 0,
    observacoes: ''
  });

  const [parcelasGeradas, setParcelasGeradas] = useState<ParcelaGerada[]>([]);
  const [parcelasAbertas, setParcelasAbertas] = useState<ParcelaAberta[]>([]);
  const [parcelaSelecionadaId, setParcelaSelecionadaId] = useState<string>('');
  const [hasActiveParcelamento, setHasActiveParcelamento] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // States for Payment Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentClientCode, setPaymentClientCode] = useState('');
  const [paymentClient, setPaymentClient] = useState<Cliente | null>(null);
  const [paymentActiveNegociacao, setPaymentActiveNegociacao] = useState<Negociacao | null>(null);
  const [paymentParcelas, setPaymentParcelas] = useState<ParcelaAberta[]>([]);
  const [paymentSelectedParcelaId, setPaymentSelectedParcelaId] = useState<string>('');

  const [filtros, setFiltros] = useState({
    codigoCliente: '',
    nomeCliente: '',
    numeroTitulo: '',
    dataInicio: '',
    dataFim: ''
  });

  useEffect(() => {
    if (formData.cliente_id) {
      const activeParcelamento = negociacoes.find(
        n => n.cliente_id === formData.cliente_id && 
             n.status === 'ATIVO' && 
             (n.tipo === 'PARCELAMENTO' || n.tipo === 'ENTRADA + PARCELAMENTO' as any)
      );
      
      if (activeParcelamento) {
        setHasActiveParcelamento(true);
        setFormData(prev => ({
          ...prev,
          tipo: 'PARCELA',
          numeroTitulo: activeParcelamento.numeroTitulo || '',
          valorDebito: activeParcelamento.valorTotal || prev.valorDebito
        }));
      } else {
        setHasActiveParcelamento(false);
        // Se não há parcelamento ativo, garantimos que o formulário não herde dados de um cliente anterior
        setFormData(prev => ({
          ...prev,
          tipo: prev.tipo === 'PARCELA' ? 'QUITACAO' : prev.tipo,
          // Se o cliente mudou ou foi limpo, limpamos o título
          numeroTitulo: prev.cliente_id ? prev.numeroTitulo : ''
        }));
      }
    } else {
      setHasActiveParcelamento(false);
    }
  }, [formData.cliente_id, negociacoes]);

  useEffect(() => {
    let qClientes = query(collection(db, 'clientes'), orderBy('nome'));
    if (selectedEmpresa) {
      qClientes = query(collection(db, 'clientes'), where('empresaId', '==', selectedEmpresa.id), orderBy('nome'));
    }
    
    const unsubClientes = onSnapshot(qClientes, (snapshot) => {
      const validClientes = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Cliente))
        .filter(c => c.empresaId);
      setClientes(validClientes);
    });

    let qNegociacoes = query(collection(db, 'negociacoes'), orderBy('createdAt', 'desc'));
    if (selectedEmpresa) {
      qNegociacoes = query(collection(db, 'negociacoes'), where('empresaId', '==', selectedEmpresa.id), orderBy('createdAt', 'desc'));
    }

    const unsubNegociacoes = onSnapshot(qNegociacoes, (snapshot) => {
      const validNegociacoes = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Negociacao))
        .filter(n => n.empresaId);
      setNegociacoes(validNegociacoes);
    }, (error) => {
      handlePermissionError(error, OperationType.LIST, 'negociacoes');
    });

    return () => {
      unsubClientes();
      unsubNegociacoes();
    };
  }, [selectedEmpresa]);

  const buscarClientePorCodigo = async () => {
    if (!formData.codigoCliente) return;
    const cliente = clientes.find(c => c.codigo === formData.codigoCliente);
    if (cliente) {
      setFormData(prev => ({
        ...prev,
        cliente_id: cliente.id,
        clienteNome: cliente.nome,
        valorDebito: cliente.valor_debito,
        numeroTitulo: cliente.numeroTitulos || ''
      }));
      
      try {
        const q = query(collection(db, 'parcelas'), 
          where('empresaId', '==', selectedEmpresa?.id), 
          where('cliente_id', '==', cliente.id)
        );
        const snapshot = await getDocs(q);
        const abertas = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as ParcelaAberta))
          .filter(p => p.status === 'PENDENTE' || p.status === 'ATRASADO');
        setParcelasAbertas(abertas);
      } catch (err) {
        console.error("Erro ao buscar parcelas:", err);
      }
    } else {
      alert("Cliente não encontrado.");
      setFormData(prev => ({ ...prev, cliente_id: '', clienteNome: '', numeroTitulo: '', valorDebito: 0 }));
      setParcelasAbertas([]);
    }
  };

  useEffect(() => {
    let juros = 0;
    if (formData.tipoJuros === 'FIXO') {
      juros = formData.valorJuros;
    } else if (formData.tipoJuros === 'PERCENTUAL') {
      juros = formData.valorDebito * (formData.valorJuros / 100);
    }
    const total = formData.valorDebito + juros;
    setFormData(prev => ({ ...prev, valorTotal: total }));
  }, [formData.valorDebito, formData.tipoJuros, formData.valorJuros]);

  useEffect(() => {
    if (formData.tipo === 'PARCELAMENTO' && formData.numero_parcelas > 0) {
      const restante = formData.valorTotal - formData.valor_entrada;
      const valorParcela = restante / formData.numero_parcelas;
      const novasParcelas: ParcelaGerada[] = [];
      
      if (formData.valor_entrada > 0) {
        novasParcelas.push({
          numero: 0,
          valor: formData.valor_entrada,
          vencimento: new Date().toISOString().split('T')[0],
          tipo_parcela: 'ENTRADA'
        });
      }

      for (let i = 1; i <= formData.numero_parcelas; i++) {
        const data = new Date();
        data.setMonth(data.getMonth() + i);
        novasParcelas.push({
          numero: i,
          valor: parseFloat(valorParcela.toFixed(2)),
          vencimento: data.toISOString().split('T')[0],
          tipo_parcela: 'PARCELA'
        });
      }
      setParcelasGeradas(novasParcelas);
    } else {
      setParcelasGeradas([]);
    }
  }, [formData.tipo, formData.valorTotal, formData.valor_entrada, formData.numero_parcelas]);

  const handleParcelaChange = (index: number, field: keyof ParcelaGerada, value: any) => {
    const updated = [...parcelasGeradas];
    updated[index] = { ...updated[index], [field]: value };
    setParcelasGeradas(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    if (!currentUser?.uid) throw new Error("Usuário não autenticado");
    const currentEmpresaId = selectedEmpresa?.id || appUser?.empresaId;
    if (!currentEmpresaId) throw new Error("Empresa não identificada");
    if (!appUser || (appUser.role !== 'COBRADOR' && appUser.role !== 'CREDOR')) {
      alert("Apenas cobradores ou credores podem registrar negociações.");
      return;
    }

    const cobradorIdResolvido = selectedEmpresa?.cobradorId;
    if (!cobradorIdResolvido) {
      throw new Error("Empresa sem cobrador vinculado.");
    }

    const cliente = clientes.find(c => c.id === formData.cliente_id);
    if (!cliente) {
      alert("Cliente inválido.");
      return;
    }

    if (!formData.numeroTitulo || formData.numeroTitulo.trim() === '') {
      alert("O Número do Título é obrigatório.");
      return;
    }

    // Validação de duplicidade de título para o mesmo cliente (apenas para novas negociações)
    const isNovaNegociacao = formData.tipo !== 'PARCELA';
    if (isNovaNegociacao) {
      const qDuplicidade = query(
        collection(db, 'negociacoes'),
        where('cliente_id', '==', cliente.id),
        where('numeroTitulo', '==', formData.numeroTitulo.trim())
      );
      const duplicidadeSnapshot = await getDocs(qDuplicidade);
      if (!duplicidadeSnapshot.empty) {
        alert("Já existe uma negociação para este cliente com este número de título.");
        return;
      }
    }

    if (formData.tipo === 'PARCELA' && !parcelaSelecionadaId) {
      alert("Selecione uma parcela para pagar.");
      return;
    }

    if (formData.tipo === 'PARCELAMENTO') {
      const somaParcelas = parcelasGeradas
        .filter(p => p.tipo_parcela !== 'ENTRADA')
        .reduce((acc, p) => acc + p.valor, 0);
      const valorRestante = formData.valorTotal - formData.valor_entrada;
      if (Math.abs(somaParcelas - valorRestante) > 0.01) {
        alert("A soma das parcelas não confere com o valor restante.");
        return;
      }
    }

    const payload = {
      cliente_id: cliente.id,
      clienteNome: cliente.nome,
      empresaId: currentEmpresaId,
      uid: currentUser.uid,
      cobrador_id: cobradorIdResolvido,
      numeroTitulo: formData.numeroTitulo.trim(),
      tipo: formData.tipo,
      valor: formData.valorTotal,
      valorTotal: formData.valorTotal,
      valorDebito: formData.valorDebito,
      valor_entrada: formData.valor_entrada,
      numero_parcelas: formData.numero_parcelas,
      parcelas_pagas: 0,
      tipoJuros: formData.tipoJuros,
      valorJuros: formData.valorJuros,
      observacoes: formData.observacoes,
      status: (formData.tipo === 'QUITACAO' || formData.tipo === 'RESGATE') ? 'QUITADO' : 'ATIVO',
      createdAt: new Date().toISOString(),
      ...(formData.tipo === 'PARCELA' ? { parcela_id: parcelaSelecionadaId } : {})
    };

    console.log("PAYLOAD NEGOCIACAO:", payload);
    console.log("PAYLOAD PARCELAS:", parcelasGeradas);

    try {
      setIsSubmitting(true);

      // --- 1. PREPARAÇÕES (FORA DA TRANSACTION) ---
      const newNegociacaoRef = doc(collection(db, 'negociacoes'));
      
      const parcelasComRef = (formData.tipo === 'PARCELAMENTO' && parcelasGeradas.length > 0)
        ? parcelasGeradas.map(p => ({
            ...p,
            ref: doc(collection(db, 'parcelas'))
          }))
        : [];
        
      const parcelaEntrada = parcelasComRef.find(p => p.tipo_parcela === 'ENTRADA');
      const parcelaEntradaId = parcelaEntrada ? parcelaEntrada.ref.id : null;

      let movIdStr: string | null = null;
      let movDesc = '';
      let movTipoParam = '';

      if (formData.tipo === 'QUITACAO' || formData.tipo === 'RESGATE') {
          movIdStr = `MOV_${newNegociacaoRef.id}_${formData.tipo}`;
          movDesc = `Baixa automática de ${formData.tipo}`;
          movTipoParam = formData.tipo;
      } else if (formData.tipo === 'PARCELAMENTO' && formData.valor_entrada > 0 && parcelaEntradaId) {
          movIdStr = `MOV_${newNegociacaoRef.id}_ENTRADA`;
          movDesc = `Baixa automática de ENTRADA`;
          movTipoParam = 'ENTRADA';
      }

      const movRefIdempotente = movIdStr ? doc(db, 'movimentacoes', movIdStr) : null;

      console.log("TESTE ADD-DOC ISOLADO. EMPRESA:", currentEmpresaId);
      try {
        const testRef = doc(db, 'negociacoes', 'teste_' + Date.now());
        await setDoc(testRef, {
          empresaId: currentEmpresaId,
          teste: true,
          uid: currentUser.uid
        });
        console.log("SUCESSO NO ADD-DOC ISOLADO");
      } catch(e) {
        console.error("FALHA NO ADD-DOC ISOLADO", e);
      }

      console.log("INICIANDO TRANSACTION");
      const negociacaoId = await runTransaction(db, async (transaction) => {
        const clienteRef = doc(db, 'clientes', cliente.id);

        console.log("EMPRESA FINAL:", currentEmpresaId);

        // 4.1 Calcular débitos e Status
        let novoDebitoCliente = formData.valorTotal;
        let tem_negociacao_ativa = true;
        let statusDaNegociacao = 'ATIVO';

        if (formData.tipo === 'QUITACAO' || formData.tipo === 'RESGATE') {
          novoDebitoCliente = 0;
          tem_negociacao_ativa = false;
          statusDaNegociacao = 'FINALIZADO';
        } else if (formData.tipo === 'PARCELAMENTO' && formData.valor_entrada > 0) {
          novoDebitoCliente = Math.max(0, formData.valorTotal - formData.valor_entrada);
        }

        const payloadCliente = {
          valor_debito: novoDebitoCliente,
          tem_negociacao_ativa: tem_negociacao_ativa,
          uid: currentUser.uid,
          empresaId: currentEmpresaId
        };
        console.log("PASSO 4 - atualizando cliente");
        console.log("CLIENTE UPDATE:", payloadCliente);
        transaction.set(clienteRef, payloadCliente, { merge: true });

        const payloadToSave = {
          ...payload,
          status: statusDaNegociacao,
          uid: currentUser.uid,
          empresaId: currentEmpresaId
        };
        console.log("PASSO 1 - criando negociacao");
        console.log("NEGOCIACAO:", payloadToSave);

        // 4.2 Create negotiation (novo histórico/ação)
        transaction.set(newNegociacaoRef, payloadToSave);

        // 4.3 Create Parcelas (se PARCELAMENTO)
        if (parcelasComRef.length > 0) {
          for (const p of parcelasComRef) {
            const [year, month, day] = p.vencimento.split('-');
            const dataVencimento = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);

            const payloadParcela = {
              negociacao_id: newNegociacaoRef.id,
              cliente_id: cliente.id,
              empresaId: currentEmpresaId,
              uid: currentUser.uid,
              cobrador_id: cobradorIdResolvido,
              numeroTitulo: formData.numeroTitulo.trim(),
              numero_parcela: p.numero,
              tipo_parcela: p.tipo_parcela || 'PARCELA',
              valor: p.valor,
              status: p.tipo_parcela === 'ENTRADA' ? 'PAGO' : 'PENDENTE',
              data_vencimento: dataVencimento.toISOString(),
              createdAt: new Date().toISOString()
            };
            console.log("PASSO 3 - criando parcelas");
            console.log("PARCELA:", payloadParcela);
            
            transaction.set(p.ref, payloadParcela);
          }
        }
        
        // 4.4 Movimentacao Automática
        if (movRefIdempotente) {
            const movData: any = {
                negociacao_id: newNegociacaoRef.id,
                titulo_id: newNegociacaoRef.id,
                parcela_id: parcelaEntradaId || null,
                tipo: movTipoParam,
                cliente_id: cliente.id,
                empresaId: currentEmpresaId,
                uid: currentUser.uid,
                cobrador_id: cobradorIdResolvido,
                origem: appUser.role === 'CREDOR' ? 'CREDOR' : 'COBRADOR',
                numeroTitulo: formData.numeroTitulo.trim(),
                valor: movTipoParam === 'ENTRADA' ? formData.valor_entrada : formData.valorTotal,
                saldo_anterior: formData.valorDebito,
                saldo_atual: novoDebitoCliente,
                negociacao_status: statusDaNegociacao,
                data: new Date().toISOString(),
                descricao: movDesc,
                createdAt: new Date().toISOString()
            };
            if (movTipoParam === 'ENTRADA') movData.numero_parcela = 0;
            
            console.log("PASSO 2 - criando movimentacao");
            console.log("MOVIMENTACAO:", movData);
            transaction.set(movRefIdempotente, movData, { merge: true });
        }

        return newNegociacaoRef.id;
      });

      logAction(appUser, 'CRIAR_NEGOCIACAO', 'negociacao', negociacaoId, {
        tipo: formData.tipo,
        valor: formData.valorTotal,
        cliente_id: cliente.id
      });

      setIsModalOpen(false);
      resetForm();
      alert("Negociação registrada com sucesso!");
    } catch (error: any) {
      console.error("Error saving negociacao:", error);
      alert(error.message || "Erro ao registrar negociação.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEstorno = async (negociacao: Negociacao) => {
    if (!currentUser?.uid) throw new Error("Usuário não autenticado");
    if (!selectedEmpresa?.id) throw new Error("Empresa não selecionada");
    if (!appUser || (appUser.role !== 'COBRADOR' && appUser.role !== 'CREDOR')) return;
    if (negociacao.status === 'ESTORNADO') return;

    const cobradorIdResolvido = selectedEmpresa?.cobradorId;
    if (!cobradorIdResolvido) {
      throw new Error("Empresa sem cobrador vinculado.");
    }
    
    if (!window.confirm("Tem certeza que deseja estornar esta negociação? O saldo do cliente será revertido.")) {
      return;
    }

    try {
      const qParcelas = query(collection(db, 'parcelas'), where('negociacao_id', '==', negociacao.id));
      const qMovimentacoes = query(collection(db, 'movimentacoes'), where('negociacao_id', '==', negociacao.id));
      const [parcelasSnapshot, movSnapshot] = await Promise.all([
        getDocs(qParcelas),
        getDocs(qMovimentacoes)
      ]);
      const parcelasIds = parcelasSnapshot.docs.map(d => d.id);
      const movimentacoesIds = movSnapshot.docs.map(d => d.id);

      await runTransaction(db, async (transaction) => {
        const clienteRef = doc(db, 'clientes', negociacao.cliente_id);
        const clienteDoc = await transaction.get(clienteRef);
        const debitoAtual = clienteDoc.exists() ? Number(clienteDoc.data().valor_debito || 0) : 0;
        
        let valorRevertido = 0;

        if (negociacao.tipo === 'QUITACAO') {
          valorRevertido = Number(negociacao.valorDebito || negociacao.valor) || 0;
        } else if (negociacao.tipo === 'PARCELAMENTO') {
          valorRevertido = Number(negociacao.valor_entrada) || 0;
        } else if (negociacao.tipo === 'PARCELA') {
          valorRevertido = Number(negociacao.valor) || 0;
        } else if (negociacao.tipo === 'RESGATE') {
          valorRevertido = Number(negociacao.valorDebito || negociacao.valor) || 0;
        }

        // Pré-carrega informações do pai se for PARCELA
        let parentNegRefToUpdate: any = null;
        let pRefToUpdate: any = null;

        if (negociacao.tipo === 'PARCELA' && negociacao.parcela_id) {
          pRefToUpdate = doc(db, 'parcelas', negociacao.parcela_id);
          parentNegRefToUpdate = doc(db, 'negociacoes', negociacao.titulo_id || 'unknown');
        }

        // Update client debt
        const updateClientData: any = { 
          valor_debito: increment(valorRevertido),
          uid: currentUser.uid,
          empresaId: selectedEmpresa.id
        };

        const novoDebito = debitoAtual + valorRevertido;

        if (negociacao.tipo !== 'PARCELA') {
          updateClientData.tem_negociacao_ativa = false;
        } else {
          // Só reativar a trava se a negociação pai realmente for ficar ATIVA
          updateClientData.tem_negociacao_ativa = true;
        }

        transaction.set(clienteRef, updateClientData, { merge: true });

        // Update negotiation status
        const negRef = doc(db, 'negociacoes', negociacao.id);
        transaction.set(negRef, { 
          status: 'ESTORNADO',
          uid: currentUser.uid,
          empresaId: selectedEmpresa.id
        }, { merge: true });

        // Update parcelas status
        for (const pid of parcelasIds) {
          const pRef = doc(db, 'parcelas', pid);
          transaction.set(pRef, { 
            status: 'ESTORNADO',
            uid: currentUser.uid,
            empresaId: selectedEmpresa.id
          }, { merge: true });
        }

        // Update all related movements status
        for (const mid of movimentacoesIds) {
          const mRef = doc(db, 'movimentacoes', mid);
          transaction.set(mRef, {
            negociacao_status: 'ESTORNADO',
            uid: currentUser.uid,
            empresaId: selectedEmpresa.id
          }, { merge: true });
        }

        if (negociacao.tipo === 'PARCELA' && pRefToUpdate) {
          if (parentNegRefToUpdate) {
            transaction.set(parentNegRefToUpdate, {
              parcelas_pagas: increment(-1),
              status: 'ATIVO',
              uid: currentUser.uid,
              empresaId: selectedEmpresa.id
            }, { merge: true });
          }

          transaction.set(pRefToUpdate, { 
            status: 'PENDENTE',
            uid: currentUser.uid,
            empresaId: selectedEmpresa.id
          }, { merge: true });
        }

        // Create Movimentacao (Estorno)
        if (valorRevertido > 0) {
          const movRef = doc(collection(db, 'movimentacoes'));
          const movimentacao = {
            cliente_id: negociacao.cliente_id,
            negociacao_id: negociacao.id,
            titulo_id: negociacao.parcela_id ? negociacao.numeroTitulo : (negociacao.id), // Identificação do título/negócio
            empresaId: selectedEmpresa.id,
            uid: currentUser.uid,
            numeroTitulo: negociacao.numeroTitulo,
            tipo: 'ESTORNO',
            valor: valorRevertido,
            saldo_anterior: debitoAtual,
            saldo_atual: Math.max(0, novoDebito),
            data: new Date().toISOString(),
            cobrador_id: cobradorIdResolvido,
            origem: appUser.role === 'CREDOR' ? 'CREDOR' : 'COBRADOR',
            negociacao_status: 'ESTORNADO'
          };
          console.log("MOVIMENTACAO ESTORNO:", movimentacao);
          transaction.set(movRef, movimentacao);
        }
      });

      logAction(appUser, 'ESTORNAR_NEGOCIACAO', 'negociacao', negociacao.id, {
        tipo: negociacao.tipo,
        valor: negociacao.valor
      });

      alert("Negociação estornada com sucesso!");
    } catch (error: any) {
      console.error("Error estornando negociacao:", error);
      alert(error.message || "Erro ao estornar negociação.");
    }
  };

  const resetForm = () => {
    setHasActiveParcelamento(false);
    setFormData({
      codigoCliente: '',
      cliente_id: '',
      clienteNome: '',
      numeroTitulo: '',
      valorDebito: 0,
      tipo: 'QUITACAO',
      valorTotal: 0,
      valor_entrada: 0,
      numero_parcelas: 1,
      tipoJuros: 'NENHUM',
      valorJuros: 0,
      observacoes: ''
    });
    setParcelasGeradas([]);
    setParcelasAbertas([]);
    setParcelaSelecionadaId('');
  };

  const buscarClienteParaPagamento = async () => {
    if (!paymentClientCode) return;
    const cliente = clientes.find(c => c.codigo === paymentClientCode);
    if (!cliente) {
      alert("Cliente não encontrado.");
      return;
    }
    setPaymentClient(cliente);
    
    const activeParcelamento = negociacoes.find(
      n => n.cliente_id === cliente.id && 
           n.status === 'ATIVO' && 
           n.tipo === 'PARCELAMENTO'
    );
    setPaymentActiveNegociacao(activeParcelamento || null);

    if (activeParcelamento) {
      try {
        const q = query(collection(db, 'parcelas'), 
          where('empresaId', '==', selectedEmpresa?.id), 
          where('negociacao_id', '==', activeParcelamento.id)
        );
        const snapshot = await getDocs(q);
        const allParcelas = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as ParcelaAberta))
          .sort((a, b) => {
             if(a.numero_parcela === 0 && b.numero_parcela !== 0) return -1;
             if(b.numero_parcela === 0 && a.numero_parcela !== 0) return 1;
             return new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime() || a.numero_parcela - b.numero_parcela;
          });
        
        setPaymentParcelas(allParcelas);
      } catch (err) {
        console.error("Erro ao buscar parcelas:", err);
      }
    } else {
      setPaymentParcelas([]);
      alert("Nenhum parcelamento ATIVO encontrado para este cliente.");
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!paymentClient || !paymentActiveNegociacao || !paymentSelectedParcelaId || !currentUser?.uid || !appUser) return;
    
    const currentEmpresaId = selectedEmpresa?.id || appUser?.empresaId;
    if (!currentEmpresaId) throw new Error("Empresa não identificada");

    if (appUser.role !== 'COBRADOR' && appUser.role !== 'CREDOR') {
      alert("Apenas cobradores ou credores podem registrar pagamentos.");
      return;
    }

    const cobradorIdResolvido = selectedEmpresa?.cobradorId;
    if (!cobradorIdResolvido) {
      throw new Error("Empresa sem cobrador vinculado.");
    }

    const parcela = paymentParcelas.find(p => p.id === paymentSelectedParcelaId);
    if (!parcela) return;

    if (parcela.tipo_parcela !== 'ENTRADA') {
      const entradaPendente = paymentParcelas.find(p => p.tipo_parcela === 'ENTRADA' && (p.status === 'PENDENTE' || p.status === 'ATRASADO'));
      if (entradaPendente) {
        alert("É necessário registrar o pagamento da entrada antes das parcelas.");
        return;
      }
    }

    try {
      setIsSubmitting(true);
      
      const negociacaoIdAux = await runTransaction(db, async (transaction) => {
        const clienteRef = doc(db, 'clientes', paymentClient.id);
        const pRef = doc(db, 'parcelas', paymentSelectedParcelaId);
        const negPaiRef = doc(db, 'negociacoes', paymentActiveNegociacao.id);

        const valorPago = Number(parcela.valor) || 0;

        transaction.set(pRef, { 
          status: 'PAGO',
          uid: currentUser.uid,
          empresaId: currentEmpresaId
        }, { merge: true });

        // Calulate if there's any remaining pending parcels
        const unpaidOthers = paymentParcelas.filter(p => p.id !== paymentSelectedParcelaId && p.status !== 'PAGO');
        const isFinalizado = unpaidOthers.length === 0;
        const novoStatusNeg = isFinalizado ? 'FINALIZADO' : 'ATIVO';

        const actualParcelasPagas = parcela.tipo_parcela !== 'ENTRADA' ? increment(1) : undefined;

        const updateClienteData: any = { 
          valor_debito: increment(-valorPago),
          uid: currentUser.uid,
          empresaId: currentEmpresaId
        };

        if (novoStatusNeg === 'FINALIZADO') {
          updateClienteData.tem_negociacao_ativa = false;
        }

        transaction.set(clienteRef, updateClienteData, { merge: true });

        const negPaiPayload: any = {
            status: novoStatusNeg,
            uid: currentUser.uid,
            empresaId: currentEmpresaId
        };
        if (actualParcelasPagas !== undefined) {
             negPaiPayload.parcelas_pagas = actualParcelasPagas;
        }

        transaction.set(negPaiRef, negPaiPayload, { merge: true });

        const activeNumTitles = paymentActiveNegociacao.numeroTitulo;
        
        const newNegRef = doc(collection(db, 'negociacoes'));
        const isEntrada = parcela.tipo_parcela === 'ENTRADA';
        const payload: any = {
          cliente_id: paymentClient.id,
          clienteNome: paymentClient.nome,
          empresaId: currentEmpresaId,
          uid: currentUser.uid,
          cobrador_id: cobradorIdResolvido,
          numeroTitulo: activeNumTitles,
          tipo: isEntrada ? 'ENTRADA' : 'PARCELA',
          valor: valorPago,
          valorTotal: valorPago,
          valorDebito: (paymentClient as any).valor_debito || valorPago,
          status: 'ATIVO',
          parcela_id: paymentSelectedParcelaId,
          numero_parcela: parcela.numero_parcela,
          createdAt: new Date().toISOString()
        };
        console.log("PAYLOAD PAGAMENTO (Nova Negociacao Interna):", payload);
        transaction.set(newNegRef, payload);

        const movPayload = {
          cliente_id: paymentClient.id,
          negociacao_id: newNegRef.id,
          titulo_id: paymentActiveNegociacao.id,
          parcela_id: paymentSelectedParcelaId,
          numero_parcela: parcela.numero_parcela,
          empresaId: currentEmpresaId,
          uid: currentUser.uid,
          numeroTitulo: activeNumTitles,
          tipo: isEntrada ? 'ENTRADA' : 'PAGAMENTO',
          valor: valorPago,
          // We can't access exact saldo_anterior from client directly, so setting to current client state
          saldo_anterior: (paymentClient as any).valor_debito || valorPago, 
          saldo_atual: Math.max(0, ((paymentClient as any).valor_debito || valorPago) - valorPago),
          data: new Date().toISOString(),
          cobrador_id: cobradorIdResolvido,
          origem: appUser.role === 'CREDOR' ? 'CREDOR' : 'COBRADOR',
          negociacao_status: 'ATIVO'
        };
        console.log("PAYLOAD MOVIMENTACAO (Pagamento):", movPayload);
        
        const movRef = doc(collection(db, 'movimentacoes'));
        transaction.set(movRef, movPayload);

        return newNegRef.id;
      });

      alert("Pagamento registrado com sucesso!");
      setIsPaymentModalOpen(false);
      setPaymentClientCode('');
      setPaymentClient(null);
      setPaymentActiveNegociacao(null);
      setPaymentParcelas([]);
      setPaymentSelectedParcelaId('');
    } catch (err: any) {
      alert("Erro: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getClienteInfo = (id: string) => {
    const cliente = clientes.find(c => c.id === id);
    return cliente ? `${cliente.codigo} - ${cliente.nome}` : 'Desconhecido';
  };

  const formatNumeroTitulo = (neg: Negociacao) => {
    if (neg.tipo === 'PARCELA' || neg.tipo === 'ENTRADA') {
      return `${neg.numeroTitulo || ''}-${neg.numero_parcela ?? ''}`;
    }
    return neg.numeroTitulo || '';
  };

  const formatProgressaoParcelas = (neg: Negociacao) => {
    if (neg.tipo === 'PARCELAMENTO' && (neg.numero_parcelas || 0) > 0) {
      return `${neg.parcelas_pagas || 0}/${neg.numero_parcelas}`;
    }
    return '-';
  };

  const filteredNegociacoes = negociacoes.filter(neg => {
    const cliente = clientes.find(c => c.id === neg.cliente_id);
    const clienteNome = cliente?.nome?.toLowerCase() || '';
    const clienteCodigo = cliente?.codigo?.toLowerCase() || '';
    
    if (filtros.codigoCliente && !clienteCodigo.includes(filtros.codigoCliente.toLowerCase())) return false;
    if (filtros.nomeCliente && !clienteNome.includes(filtros.nomeCliente.toLowerCase())) return false;
    if (filtros.numeroTitulo && !formatNumeroTitulo(neg).includes(filtros.numeroTitulo)) return false;
    
    const dataLancamento = new Date(neg.createdAt);
    
    if (filtros.dataInicio) {
      const [year, month, day] = filtros.dataInicio.split('-');
      const inicio = new Date(Number(year), Number(month) - 1, Number(day));
      inicio.setHours(0, 0, 0, 0);
      if (dataLancamento.getTime() < inicio.getTime()) return false;
    }
    
    if (filtros.dataFim) {
      const [year, month, day] = filtros.dataFim.split('-');
      const fim = new Date(Number(year), Number(month) - 1, Number(day));
      fim.setHours(23, 59, 59, 999);
      if (dataLancamento.getTime() > fim.getTime()) return false;
    }
    
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-3">
            Negociações
            {appUser?.role === 'CREDOR' && (
              <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-3 py-1 rounded-full uppercase tracking-wider border border-blue-200">
                Operando como Credor
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-gray-500">Histórico e registro de negociações.</p>
        </div>
        {(appUser?.role === 'COBRADOR' || appUser?.role === 'CREDOR') && (
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button 
               className="h-11 px-5 rounded-xl transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-md bg-blue-600 hover:bg-blue-700 text-white font-medium"
               onClick={() => setIsModalOpen(true)}
               disabled={isSubmitting}
            >
              <Handshake className="w-5 h-5 mr-2" />
              Registrar Negociação
            </Button>
            <Button 
               className="h-11 px-5 rounded-xl transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-md bg-green-600 hover:bg-green-700 text-white font-medium" 
               onClick={() => setIsPaymentModalOpen(true)}
               disabled={isSubmitting}
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Registrar Pagamento
            </Button>
          </div>
        )}
      </div>

      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cód. Cliente</label>
            <Input
              value={filtros.codigoCliente}
              onChange={(e) => setFiltros(f => ({ ...f, codigoCliente: e.target.value }))}
              placeholder="Ex: 001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome Cliente</label>
            <Input
              value={filtros.nomeCliente}
              onChange={(e) => setFiltros(f => ({ ...f, nomeCliente: e.target.value }))}
              placeholder="Buscar..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nº Título</label>
            <Input
              value={filtros.numeroTitulo}
              onChange={(e) => setFiltros(f => ({ ...f, numeroTitulo: e.target.value }))}
              placeholder="Ex: 4545"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label>
            <Input
              type="date"
              value={filtros.dataInicio}
              onChange={(e) => setFiltros(f => ({ ...f, dataInicio: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label>
            <Input
              type="date"
              value={filtros.dataFim}
              onChange={(e) => setFiltros(f => ({ ...f, dataFim: e.target.value }))}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end relative">
           <Button variant="secondary" onClick={() => setFiltros({
              codigoCliente: '', nomeCliente: '', numeroTitulo: '', dataInicio: '', dataFim: ''
           })}>Limpar Filtros</Button>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nº Título</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrada</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parcelas</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredNegociacoes.map((neg) => (
                <tr key={neg.id} className={neg.status === 'ESTORNADO' ? 'opacity-50 bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(neg.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {formatNumeroTitulo(neg)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {getClienteInfo(neg.cliente_id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      {neg.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {neg.status === 'ESTORNADO' ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        ESTORNADO
                      </span>
                    ) : neg.status === 'QUITADO' || neg.status === 'FINALIZADO' || neg.status === 'PAGO' ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {neg.status}
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        ATIVO
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(neg.valor)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {neg.valor_entrada ? (
                      <div>
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(neg.valor_entrada)}
                        <span className="ml-2 px-2 inline-flex text-[10px] leading-4 font-semibold rounded-full bg-green-100 text-green-800">PAGA</span>
                      </div>
                    ) : neg.tipo === 'ENTRADA' ? (
                      <span className="px-2 inline-flex text-[10px] leading-4 font-semibold rounded-full bg-green-100 text-green-800">PAGA</span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                    {formatProgressaoParcelas(neg)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {appUser?.role === 'COBRADOR' && neg.status !== 'ESTORNADO' && (
                      <Button variant="danger" size="sm" onClick={() => handleEstorno(neg)} title="Estornar Negociação">
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredNegociacoes.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-sm text-gray-500">
                    Nenhuma negociação encontrada ou registrada.
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0 bg-white z-10 sticky top-0">
              <h3 className="text-lg font-medium text-gray-900">Nova Negociação</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 flex-1">
              <form id="nova-negociacao-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Código do Cliente"
                  value={formData.codigoCliente}
                  onChange={(e) => setFormData({ ...formData, codigoCliente: e.target.value })}
                  onBlur={buscarClientePorCodigo}
                  required
                />
                <Input
                  label="Nome do Cliente"
                  value={formData.clienteNome}
                  readOnly
                  className="bg-gray-50"
                />
                <div className="md:col-span-2">
                  <Input
                    label="Número do Título"
                    value={formData.numeroTitulo}
                    onChange={(e) => setFormData({ ...formData, numeroTitulo: e.target.value })}
                    required
                    readOnly={true}
                    className="bg-gray-50 cursor-not-allowed"
                    placeholder="Ex: 12345 (Preenchido automaticamente pelo cadastro do cliente)"
                  />
                </div>
                <Input
                  label="Valor do Débito (R$)"
                  type="number"
                  value={formData.valorDebito}
                  readOnly
                  className="bg-gray-50"
                />
                
                {!hasActiveParcelamento && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Juros</label>
                      <select
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                        value={formData.tipoJuros}
                        onChange={(e) => setFormData({ ...formData, tipoJuros: e.target.value })}
                      >
                        <option value="NENHUM">Nenhum</option>
                        <option value="PERCENTUAL">Percentual (%)</option>
                        <option value="FIXO">Valor Fixo (R$)</option>
                      </select>
                    </div>
                    
                    <Input
                      label="Valor Juros"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.valorJuros}
                      onChange={(e) => setFormData({ ...formData, valorJuros: parseFloat(e.target.value) || 0 })}
                      disabled={formData.tipoJuros === 'NENHUM'}
                    />

                    <Input
                      label="Valor Total Negociado (R$)"
                      type="number"
                      value={formData.valorTotal}
                      readOnly
                      className="bg-gray-50 font-bold text-lg"
                    />
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Negociação</label>
                  <select
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={formData.tipo}
                    onChange={(e) => {
                      setFormData({ ...formData, tipo: e.target.value as any });
                      setParcelaSelecionadaId('');
                    }}
                    required
                    disabled={hasActiveParcelamento}
                  >
                    {hasActiveParcelamento ? (
                      <option value="PARCELA">Pagamento de Parcela</option>
                    ) : (
                      <>
                        <option value="QUITACAO">Quitação</option>
                        <option value="PARCELAMENTO">Entrada + Parcelamento</option>
                        {parcelasAbertas.length > 0 && <option value="PARCELA">Pagamento de Parcela</option>}
                        <option value="RESGATE">Resgate de Objeto</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {formData.tipo === 'PARCELA' && parcelasAbertas.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Selecione a Parcela</label>
                  <select
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={parcelaSelecionadaId}
                    onChange={(e) => setParcelaSelecionadaId(e.target.value)}
                    required
                  >
                    <option value="">Selecione...</option>
                    {parcelasAbertas.map(p => (
                      <option key={p.id} value={p.id}>
                        Parcela {p.numero_parcela} - R$ {p.valor.toFixed(2)} - Venc: {new Date(p.data_vencimento).toLocaleDateString('pt-BR')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formData.tipo === 'PARCELAMENTO' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4 mt-4">
                  <Input
                    label="Valor da Entrada (R$)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.valor_entrada}
                    onChange={(e) => setFormData({ ...formData, valor_entrada: parseFloat(e.target.value) || 0 })}
                    required
                  />
                  <Input
                    label="Número de Parcelas"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.numero_parcelas}
                    onChange={(e) => setFormData({ ...formData, numero_parcelas: parseInt(e.target.value) || 1 })}
                    required
                  />
                  
                  {parcelasGeradas.length > 0 && (
                    <div className="md:col-span-2 mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Parcelas Geradas</h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {parcelasGeradas.map((p, index) => (
                          <div key={index} className="flex items-center space-x-2 bg-gray-50 p-2 rounded">
                            <span className="text-sm font-medium w-8">{p.numero}º</span>
                            <Input
                              label=""
                              type="number"
                              step="0.01"
                              value={p.valor}
                              onChange={(e) => handleParcelaChange(index, 'valor', parseFloat(e.target.value) || 0)}
                              className="w-32"
                            />
                            <Input
                              label=""
                              type="date"
                              value={p.vencimento}
                              onChange={(e) => handleParcelaChange(index, 'vencimento', e.target.value)}
                              className="w-40"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  rows={3}
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                />
              </div>

              </form>
            </div>
            <div className="p-6 border-t border-gray-200 bg-white shrink-0 sticky bottom-0 z-10 flex justify-end space-x-3">
              <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" form="nova-negociacao-form" disabled={isSubmitting}>
                {isSubmitting ? 'Processando...' : 'Registrar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Pagamento Rápido */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0 bg-white z-10 sticky top-0">
              <h3 className="text-lg font-medium text-gray-900">Registrar Pagamento</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <form id="registrar-pagamento-form" onSubmit={handlePaymentSubmit} className="space-y-4">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input
                      label="Código do Cliente"
                      value={paymentClientCode}
                      onChange={(e) => setPaymentClientCode(e.target.value.toUpperCase())}
                      placeholder="Cód..."
                    />
                  </div>
                  <Button type="button" onClick={buscarClienteParaPagamento}>
                    Buscar
                  </Button>
                </div>

                {paymentClient && (
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2 border border-gray-200 mt-4">
                    <p className="text-sm font-medium text-gray-900">Cliente: <span className="font-bold text-blue-700">{paymentClient.nome}</span></p>
                    
                    {paymentActiveNegociacao ? (
                      <>
                        <p className="text-sm text-gray-700">Tít: <span className="font-semibold">{paymentActiveNegociacao.numeroTitulo}</span></p>
                        <p className="text-sm text-gray-700">Total Negociado: <span className="font-semibold text-green-700">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(paymentActiveNegociacao.valorTotal || 0)}
                        </span></p>
                        
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Selecione a Parcela para Pagamento</label>
                          <select
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white"
                            value={paymentSelectedParcelaId}
                            onChange={(e) => setPaymentSelectedParcelaId(e.target.value)}
                            required
                          >
                            <option value="">Selecione...</option>
                            {paymentParcelas.map(p => {
                              const title = p.tipo_parcela === 'ENTRADA' ? `ENTRADA` : `Parcela ${p.numero_parcela}`;
                              const stat = p.status === 'PAGO' ? 'PAGO' : (p.status === 'ATRASADO' ? 'ATRASADO' : 'PENDENTE');
                              // Do not allow selecting paid ones natively, although JS handles it we can disable it
                              return (
                                <option key={p.id} value={p.id} disabled={p.status === 'PAGO'}>
                                  {title} - R$ {p.valor.toFixed(2)} - Venc: {new Date(p.data_vencimento).toLocaleDateString('pt-BR')} [{stat}]
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-red-600 font-medium">Nenhum parcelamento ativo encontrado.</p>
                    )}
                  </div>
                )}

              </form>
            </div>
            <div className="p-6 flex justify-end space-x-3 border-t border-gray-200 shrink-0 bg-white z-10 sticky bottom-0">
              <Button type="button" variant="secondary" onClick={() => setIsPaymentModalOpen(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" form="registrar-pagamento-form" disabled={isSubmitting || !paymentSelectedParcelaId}>
                {isSubmitting ? 'Processando...' : 'Confirmar Pagamento'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
