// Clasificación de propiedades para flipping rápido (compra → reforma → venta
// en 7-14 meses). Algunas red flags rompen el ciclo "pim pam" y no merecen
// salir en el top del Pulse de un flipper, aunque el descuento sea grande.
//
// Este módulo NO toca el opportunity_score (que sigue siendo descuento honesto
// vs mediana del bucket). Solo decide visibilidad/exclusión en el ranking del
// Pulse cuando el lector es un flipper.
//
// Otras roles (inmobiliaria, buying_agent, inversor_directo) tienen tolerancia
// distinta y NO usan este filtro:
//   - inversor_directo OK con `has_tenant` si busca renta + yield estable.
//   - inmobiliaria OK con `occupied` si capta para revender a otro inversor.
//   - buying_agent depende del cliente.

/**
 * Flags que rompen el ciclo flip rápido: tiempo legal, precio limitado por ley
 * o riesgo estructural. Una sola basta para excluir.
 */
export const FLIPPER_HARD_BLOCK_FLAGS = [
  'occupied', // okupa → desalojo 6-24 meses
  'has_tenant', // inquilino con contrato LAU → no puedes reformar
  'vpo', // precio máximo legal → mata el margen
  'illegal_construction', // sin licencia → legalización compleja
] as const;

/**
 * Flags de fricción pero gestionables: cargas, no visitable, sin cédula,
 * precio oculto. Una sola es soft (mostrar con caveat). Dos o más combinadas
 * acumulan fricción y se excluyen.
 */
export const FLIPPER_SOFT_WARN_FLAGS = [
  'has_charges',
  'not_visitable',
  'no_habitability',
  'hidden_price',
] as const;

export type FlipperEligibilityStatus = 'eligible' | 'eligible_with_warning' | 'excluded';

export interface FlipperEligibility {
  status: FlipperEligibilityStatus;
  /** Flags que motivaron la exclusión (vacío si no excluida). */
  excludingFlags: string[];
  /** Flags soft presentes (informativos, no excluyen por sí solos). */
  warningFlags: string[];
  /** Frase humana auditable. */
  reason: string;
}

/**
 * Clasifica una propiedad para flipping rápido en base a sus red flags.
 * NO mira score, precio ni m². Solo decisión binaria sobre fricción legal/práctica.
 */
export function classifyForFlipper(redFlags: string[] | null | undefined): FlipperEligibility {
  const flags = redFlags ?? [];
  const blocking = flags.filter((f) => (FLIPPER_HARD_BLOCK_FLAGS as readonly string[]).includes(f));
  const warning = flags.filter((f) => (FLIPPER_SOFT_WARN_FLAGS as readonly string[]).includes(f));

  if (blocking.length > 0) {
    return {
      status: 'excluded',
      excludingFlags: blocking,
      warningFlags: warning,
      reason: `Incompatible con flip rápido: ${blocking.join(', ')}`,
    };
  }

  if (warning.length >= 2) {
    return {
      status: 'excluded',
      excludingFlags: [],
      warningFlags: warning,
      reason: `Demasiada fricción acumulada (${warning.length} señales: ${warning.join(', ')})`,
    };
  }

  if (warning.length === 1) {
    return {
      status: 'eligible_with_warning',
      excludingFlags: [],
      warningFlags: warning,
      reason: `Apto con aviso: ${warning[0]}`,
    };
  }

  return {
    status: 'eligible',
    excludingFlags: [],
    warningFlags: [],
    reason: 'Sin red flags detectadas',
  };
}
