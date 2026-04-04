import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

export const logAction = async (
  user: { id: string; nome: string; role: string } | null | undefined,
  acao: string,
  entidade: string,
  entidade_id: string,
  detalhes: any = {}
) => {
  if (!user) return;

  try {
    await addDoc(collection(db, 'logs'), {
      user_id: user.id,
      user_nome: user.nome,
      user_role: user.role,
      acao,
      entidade,
      entidade_id,
      detalhes,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Falha ao registrar log de auditoria:', error);
    // Fail-safe: não propaga o erro para não quebrar o fluxo principal
  }
};
