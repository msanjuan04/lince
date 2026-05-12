// Solo retenemos helpers de fecha para el resto de mocks (agency, etc.).
// Los mocks de Property se borraron en sprint 1.B: la app solo muestra datos
// reales de Supabase. Si la DB está vacía, la UI enseña "sin datos" honesto.

export const MOCK_TODAY = new Date('2026-05-13T10:00:00Z');

export function daysAgo(n: number, base: Date = MOCK_TODAY): Date {
  return new Date(base.getTime() - n * 86_400_000);
}

export function hoursAgo(n: number, base: Date = MOCK_TODAY): Date {
  return new Date(base.getTime() - n * 3_600_000);
}
