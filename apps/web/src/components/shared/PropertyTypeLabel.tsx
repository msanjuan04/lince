import type { PropertyType } from '@/lib/data/types';

const TYPE_LABEL: Record<PropertyType, string> = {
  piso: 'Piso',
  casa: 'Casa',
  atico: 'Ático',
  duplex: 'Dúplex',
  local: 'Local',
  terreno: 'Terreno',
};

export function propertyTypeLabel(type: PropertyType): string {
  return TYPE_LABEL[type];
}

export function PropertyTypeLabel({ type }: { type: PropertyType }) {
  return <span>{TYPE_LABEL[type]}</span>;
}
