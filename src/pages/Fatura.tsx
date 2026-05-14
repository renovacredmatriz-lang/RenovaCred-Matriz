import React, { useState, useEffect } from 'react';
import { useAuth, OperationType } from '../contexts/AuthContext';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Printer, MessageCircle, FileText, Building2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';

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
  cidade?: string;
  estado?: string;
  telefone1?: string;
  telefone2?: string;
  email?: string;
}

export default function Fatura() {
  const { appUser, handlePermissionError } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
  
  const [faturaData, setFaturaData] = useState({
    descricao: "Prestação de serviços especializados de cobrança e recuperação de crédito, incluindo gestão de carteira, negociação com clientes, acompanhamento de recebimentos e suporte estratégico na redução de inadimplência.",
    valorServicos: '',
    valorAdicionais: '',
    valorDescontos: ''
  });

  useEffect(() => {
    if (appUser?.role !== 'MASTER') return;

    const fetchEmpresas = async () => {
      try {
        const q = query(collection(db, 'empresas'), where('ativo', '==', true));
        const snapshot = await getDocs(q);
        const empresasData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Empresa[];

        // Ordenação local priorizando nomeFantasia
        empresasData.sort((a, b) => {
          const nomeA = (a.nomeFantasia || a.nome || '').toLowerCase();
          const nomeB = (b.nomeFantasia || b.nome || '').toLowerCase();
          return nomeA.localeCompare(nomeB);
        });

        setEmpresas(empresasData);
      } catch (error) {
        handlePermissionError(error, OperationType.LIST, 'empresas');
      }
    };

    fetchEmpresas();
  }, [appUser, handlePermissionError]);

  if (appUser?.role !== 'MASTER') {
    return <Navigate to="/" replace />;
  }

  const empresaSelecionada = empresas.find(e => e.id === selectedEmpresaId);

  const vServicos = Number(faturaData.valorServicos) || 0;
  const vAdicionais = Number(faturaData.valorAdicionais) || 0;
  const vDescontos = Number(faturaData.valorDescontos) || 0;
  const totalFatura = vServicos + vAdicionais - vDescontos;

  const telefonesFormatados = empresaSelecionada 
    ? [empresaSelecionada.telefone1, empresaSelecionada.telefone2].filter(Boolean).join(' / ') || 'Não informado'
    : 'Não informado';

  const enderecoCompleto = empresaSelecionada
    ? [
        empresaSelecionada.endereco,
        empresaSelecionada.numero,
        empresaSelecionada.bairro ? `- ${empresaSelecionada.bairro}` : '',
        empresaSelecionada.cidade,
        empresaSelecionada.estado ? `/${empresaSelecionada.estado}` : ''
      ].filter(Boolean).join(' ').replace(' -', ',').replace(' /', '/') || 'Não informado'
    : 'Não informado';

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = () => {
    const telefoneParaEnvio = empresaSelecionada?.telefone1 || empresaSelecionada?.telefone2;
    
    if (!telefoneParaEnvio) {
      alert("A empresa selecionada não possui telefone cadastrado.");
      return;
    }

    const telefoneLimpo = telefoneParaEnvio.replace(/\D/g, '');
    const totalFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalFatura);
    
    const mensagem = `Olá! Segue o resumo da sua fatura referente aos serviços de cobrança:\n\n` +
      `*Empresa:* ${empresaSelecionada.nomeFantasia || empresaSelecionada.nome}\n` +
      `*Total da Fatura:* ${totalFormatado}\n\n` +
      `Agradecemos a parceria!`;

    const url = `https://wa.me/55${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const dataEmissao = new Date().toLocaleDateString('pt-BR');

  return (
    <div className="space-y-6">
      {/* --- ÁREA INTERATIVA (NÃO IMPRESSA) --- */}
      <div className="print:hidden space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Emissão de Fatura</h1>
            <p className="mt-1 text-sm text-gray-500">Gere faturas de serviço para as empresas parceiras.</p>
          </div>
          <div className="flex space-x-3">
            <Button variant="secondary" onClick={handleWhatsApp} disabled={!selectedEmpresaId}>
              <MessageCircle className="w-4 h-4 mr-2" />
              WhatsApp
            </Button>
            <Button onClick={handlePrint} disabled={!selectedEmpresaId}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir Fatura
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-medium text-gray-900">Dados do Cliente</h2>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Selecione a Empresa</label>
                  <select
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={selectedEmpresaId}
                    onChange={(e) => setSelectedEmpresaId(e.target.value)}
                  >
                    <option value="">-- Selecione --</option>
                    {empresas.map(e => (
                      <option key={e.id} value={e.id}>{e.nomeFantasia || e.nome}</option>
                    ))}
                  </select>
                </div>

                {empresaSelecionada && (
                  <div className="bg-gray-50 p-4 rounded-md border border-gray-200 text-sm space-y-2">
                    <p><strong>Razão Social:</strong> {empresaSelecionada.razaoSocial || empresaSelecionada.nome}</p>
                    <p><strong>CNPJ:</strong> {empresaSelecionada.cnpj || 'Não informado'}</p>
                    <p><strong>Inscrição Estadual:</strong> {empresaSelecionada.inscricaoEstadual || 'Não informado'}</p>
                    <p><strong>Endereço:</strong> {enderecoCompleto}</p>
                    <p><strong>Telefone:</strong> {telefonesFormatados}</p>
                    <p><strong>E-mail:</strong> {empresaSelecionada.email || 'Não informado'}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-medium text-gray-900">Descrição dos Serviços</h2>
                </div>
                <div>
                  <textarea
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    rows={4}
                    value={faturaData.descricao}
                    onChange={(e) => setFaturaData({ ...faturaData, descricao: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Valores</h2>
                
                <Input
                  label="Valor dos Serviços"
                  type="number"
                  step="0.01"
                  value={faturaData.valorServicos}
                  onChange={(e) => setFaturaData({ ...faturaData, valorServicos: e.target.value })}
                />
                <Input
                  label="Serviços Adicionais"
                  type="number"
                  step="0.01"
                  value={faturaData.valorAdicionais}
                  onChange={(e) => setFaturaData({ ...faturaData, valorAdicionais: e.target.value })}
                />
                <Input
                  label="Descontos"
                  type="number"
                  step="0.01"
                  value={faturaData.valorDescontos}
                  onChange={(e) => setFaturaData({ ...faturaData, valorDescontos: e.target.value })}
                />

                <div className="pt-4 mt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-base font-medium text-gray-900">Total da Fatura</span>
                    <span className="text-2xl font-bold text-blue-600">{formatCurrency(totalFatura)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* --- ÁREA DE IMPRESSÃO (VISÍVEL APENAS NA IMPRESSORA) --- */}
      {empresaSelecionada && (
        <div className="hidden print:block bg-white text-black p-8 max-w-[210mm] mx-auto min-h-[297mm]">
          
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-8">
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">RENOVACRED</h1>
              <p className="text-sm text-gray-500 font-medium tracking-widest uppercase mt-1">Soluções em Cobrança</p>
            </div>
            <div className="text-right text-sm text-gray-600">
              <p className="font-bold text-gray-900 text-lg mb-1">FATURA DE SERVIÇOS</p>
              <p>Data de Emissão: {dataEmissao}</p>
            </div>
          </div>

          {/* Client Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Faturado para</h2>
            <p className="text-xl font-bold text-gray-900 mb-2">{empresaSelecionada.nomeFantasia || empresaSelecionada.nome}</p>
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
              <div>
                <p><strong>Razão Social:</strong> {empresaSelecionada.razaoSocial || empresaSelecionada.nome}</p>
                <p><strong>CNPJ:</strong> {empresaSelecionada.cnpj || 'Não informado'}</p>
                <p><strong>Inscrição Estadual:</strong> {empresaSelecionada.inscricaoEstadual || 'Não informado'}</p>
              </div>
              <div>
                <p><strong>Endereço:</strong> {enderecoCompleto}</p>
                <p><strong>Contato:</strong> {telefonesFormatados}</p>
                <p><strong>E-mail:</strong> {empresaSelecionada.email || 'Não informado'}</p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="mb-8">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Descrição dos Serviços</h2>
            <p className="text-gray-800 leading-relaxed text-sm whitespace-pre-wrap">
              {faturaData.descricao}
            </p>
          </div>

          {/* Financial Table */}
          <table className="w-full mb-8 border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-800">
                <th className="py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Item</th>
                <th className="py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Valor</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className="border-b border-gray-200">
                <td className="py-4 text-gray-800 font-medium">Serviços de Cobrança</td>
                <td className="py-4 text-right text-gray-900">{formatCurrency(vServicos)}</td>
              </tr>
              {vAdicionais > 0 && (
                <tr className="border-b border-gray-200">
                  <td className="py-4 text-gray-800 font-medium">Serviços Adicionais</td>
                  <td className="py-4 text-right text-gray-900">{formatCurrency(vAdicionais)}</td>
                </tr>
              )}
              {vDescontos > 0 && (
                <tr className="border-b border-gray-200">
                  <td className="py-4 text-gray-800 font-medium">Descontos Concedidos</td>
                  <td className="py-4 text-right text-red-600">-{formatCurrency(vDescontos)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="bloco-final-fatura">
            {/* Total Section */}
            <div className="flex justify-end items-center py-6 border-t-2 border-gray-800">
              <span className="font-bold text-gray-900 uppercase tracking-wider text-sm pr-4">Total a Pagar</span>
              <span className="font-black text-2xl text-gray-900">
                {formatCurrency(totalFatura)}
              </span>
            </div>

            {/* PIX and Signature Section Layout Side-by-Side */}
            <div className="flex items-end justify-between border-t mt-6 pt-6 gap-8">
              {/* Left Side - PIX Section */}
              <div className="pix-container flex flex-col items-center gap-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Pagamento via PIX</span>
                <img 
                  src="https://i.postimg.cc/pXgYR4Cs/Whats-App-Image-2026-04-20-at-11-20-27.jpg" 
                  alt="QR Code PIX"
                  style={{ width: '110px', height: '110px' }}
                  className="object-contain border border-gray-100 rounded-lg p-1 bg-white"
                  referrerPolicy="no-referrer"
                />
                <p className="text-[10px] text-gray-600 font-medium lowercase">
                  financeirorenovacred@gmail.com
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText('financeirorenovacred@gmail.com');
                    alert('Chave PIX copiada!');
                  }}
                  className="text-[10px] text-blue-600 font-bold uppercase tracking-tighter hover:underline print:hidden"
                >
                  Copiar chave PIX
                </button>
              </div>

              {/* Right Side - Signature Section */}
              <div className="flex flex-col items-center justify-end min-h-[110px] mb-4">
                <div className="w-40 border-t border-gray-800 mb-2"></div>
                <p className="text-xs font-bold text-gray-900 uppercase tracking-tight">RenovaCred Soluções em Cobrança</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Departamento Financeiro</p>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
