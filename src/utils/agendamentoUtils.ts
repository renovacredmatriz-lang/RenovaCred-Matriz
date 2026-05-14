export const normalizeDate = (dateInput: any): Date | null => {
  if (!dateInput) return null;

  // Handle Firebase Timestamp (se existir no banco legado)
  if (typeof dateInput === 'object' && typeof dateInput.toDate === 'function') {
    const d = dateInput.toDate();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return null;
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 0, 0, 0, 0);
  }

  const str = String(dateInput).trim();

  // Formato BR legado: "17/04/2026, 08:36:00"
  if (str.includes('/')) {
    const [datePart] = str.split(',');
    const [day, month, year] = datePart.trim().split('/');
    if (day && month && year && year.length === 4) {
      return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
    }
  }

  // Inicialização pura "YYYY-MM-DD" (evita bug de timezone de UTC do browser)
  const isJustDateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  if (isJustDateRegex.test(str)) {
    const [_, year, month, day] = str.match(isJustDateRegex)!;
    return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  // Parse Date normal (ex: formato ISO "2026-05-13T02:47:00.000Z")
  const parsedDate = new Date(str);
  if (!isNaN(parsedDate.getTime())) {
    // Usamos os métodos locais (getFullYear, etc) para extrair a data correta no fuso horário do usuário.
    return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0);
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
