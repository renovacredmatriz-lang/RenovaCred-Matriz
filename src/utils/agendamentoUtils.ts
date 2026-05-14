export const normalizeDate = (dateInput: any): Date | null => {
  if (!dateInput) return null;

  // Handle Firebase Timestamp (se existir no banco legado)
  if (typeof dateInput === 'object' && typeof dateInput.toDate === 'function') {
    const d = dateInput.toDate();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  const str = String(dateInput).trim();

  // Formato BR legado: "17/04/2026, 08:36:00"
  if (str.includes('/')) {
    const [datePart] = str.split(',');
    const [day, month, year] = datePart.trim().split('/');
    return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  // Formato ISO: "2026-04-17T08:36:00.000Z" ou inicialização pura "YYYY-MM-DD"
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [_, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  // Fallback seguro 
  const fallbackDate = new Date(str);
  if (!isNaN(fallbackDate.getTime())) {
    return new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), fallbackDate.getDate(), 0, 0, 0, 0);
  }

  return null;
};

export const getAgendamentoStatusLogico = (agendamentoStatus: string, dateInput: any): 'PENDENTE' | 'VENCIDO' | 'HOJE' | 'CONCLUIDO' | 'REAGENDADO' | string => {
  const currentStatus = (agendamentoStatus || '').trim().toUpperCase();
  
  if (currentStatus !== 'PENDENTE') {
    return currentStatus;
  }

  const agDate = normalizeDate(dateInput);
  if (!agDate) {
    return currentStatus;
  }

  const today = normalizeDate(new Date());
  if (!today) return currentStatus;

  if (agDate.getTime() < today.getTime()) {
    return 'VENCIDO';
  }

  if (agDate.getTime() === today.getTime()) {
    return 'HOJE';
  }

  return 'PENDENTE';
};
