// Tipos y constantes de tracking — client-safe (no toca Prisma ni cookies).

export type PropertyTrackStatus =
  | 'watching'
  | 'interested'
  | 'contacted'
  | 'viewed'
  | 'offering'
  | 'rejected'
  | 'bought';

export interface PropertyTrack {
  status: PropertyTrackStatus;
  notes: string | null;
  targetPriceEur: number | null;
  contactedAt: Date | null;
  viewedAt: Date | null;
  updatedAt: Date;
}

export const TRACK_STATUS_LABEL: Record<PropertyTrackStatus, string> = {
  watching: 'Vigilando',
  interested: 'Interesado',
  contacted: 'Contactado',
  viewed: 'Visitado',
  offering: 'Negociando',
  rejected: 'Descartado',
  bought: 'Adquirido',
};

export const TRACK_STATUS_TONE: Record<PropertyTrackStatus, 'default' | 'highlight' | 'mute'> = {
  watching: 'default',
  interested: 'highlight',
  contacted: 'highlight',
  viewed: 'highlight',
  offering: 'highlight',
  rejected: 'mute',
  bought: 'highlight',
};
