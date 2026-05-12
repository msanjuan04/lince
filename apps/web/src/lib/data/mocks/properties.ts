// Mocks de propiedades retirados en sprint 1.B.
// La app consume SOLO datos reales de Supabase vía adaptador en `db.ts`.
// Si la DB está vacía, la UI muestra estado vacío honesto.

import type { Property } from '../types';

export const propertiesMock: Property[] = [];
