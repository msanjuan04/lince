// Dataset de referencia del mercado AMB + Maresme + Vallès Occidental.
// Fuente: informe "Mapa de Precios Inmobiliarios" abril-mayo 2026
//          (Idealista, Indomio, RealAdvisor, Engel & Völkers, Fotocasa, Tinsa).
//
// Cada entrada es VERIFICABLE contra el informe. Si dudas de un número, abre el
// PDF y comprueba la línea correspondiente — la columna `source` indica el
// portal y la fecha exacta.
//
// Política de uso:
//   - El sistema usa estos datos como fallback cuando el crawler Lince todavía
//     no tiene suficiente histórico (<60-90 días) para calcular medianas
//     post-reforma reales por CP.
//   - Cuando el crawler tenga datos, prevalecen sobre este dataset.
//   - El dataset se refresca semestralmente. Próxima revisión: octubre 2026.

export type Tier = 'A' | 'B' | 'C' | 'D';
/** D = momentum negativo, descartado del top por defecto. */

export type Momentum = 'high' | 'medium' | 'low' | 'negative';

export interface MarketReferenceEntry {
  /** Municipio según el informe. */
  municipality: string;
  /** Barrio / distrito / zona dentro del municipio. null si solo hay agregado municipal. */
  district: string | null;
  /** Lista de códigos postales que cubre la zona (asignación aproximada del autor del adapter). */
  postalCodes: string[];
  /** Precio medio €/m² del municipio o barrio. */
  avgEurM2: number;
  /**
   * Precio €/m² de la zona premium del municipio (techo conocido). null si el
   * informe no diferencia premium para esa entrada.
   */
  premiumEurM2: number | null;
  /** Variación interanual %, sin signo (puede ser negativa). */
  yoyPct: number;
  /** Eje del informe. */
  axis: 'BCN' | 'AMB' | 'Maresme' | 'Vallès';
  /** Tier asignado por las reglas (ver `computeTier` abajo). */
  tier: Tier;
  /** Momentum cualitativo. */
  momentum: Momentum;
  /** Fuente y fecha del dato (cita literal). */
  source: string;
  /** Notas relevantes — caveats, contexto. */
  notes?: string;
}

// ============================================================================
// EJE 1 — BCN CIUDAD (10 distritos)
// ============================================================================

const BCN_CIUDAD: MarketReferenceEntry[] = [
  {
    municipality: 'Barcelona',
    district: 'Sarrià-Sant Gervasi',
    postalCodes: ['08017', '08022', '08034', '08006', '08021'],
    avgEurM2: 5221,
    premiumEurM2: 7000,
    yoyPct: 12.2,
    axis: 'BCN',
    tier: 'A',
    momentum: 'high',
    source: 'Idealista abril 2026',
    notes: 'Pedralbes y Tres Torres son el máximo absoluto del distrito.',
  },
  {
    municipality: 'Barcelona',
    district: 'Les Corts',
    postalCodes: ['08028', '08029'],
    avgEurM2: 6458,
    premiumEurM2: 6458,
    yoyPct: 11.3,
    axis: 'BCN',
    tier: 'A',
    momentum: 'high',
    source: 'Idealista abril 2026',
  },
  {
    municipality: 'Barcelona',
    district: 'Eixample (Dreta)',
    postalCodes: ['08008', '08009', '08010'],
    avgEurM2: 6439,
    premiumEurM2: 6439,
    yoyPct: 5.8,
    axis: 'BCN',
    tier: 'A',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes: 'Eje Pg. Gràcia - Diagonal supera los 6.200 €/m².',
  },
  {
    municipality: 'Barcelona',
    district: 'Eixample (Esquerre)',
    postalCodes: ['08007', '08011', '08015', '08029'],
    avgEurM2: 5650,
    premiumEurM2: 5800,
    yoyPct: 5.8,
    axis: 'BCN',
    tier: 'A',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes: '08015 incluye Sant Antoni (gentrificación activa).',
  },
  {
    municipality: 'Barcelona',
    district: 'Gràcia',
    postalCodes: ['08012', '08023', '08024', '08025', '08037'],
    avgEurM2: 5570,
    premiumEurM2: 5570,
    yoyPct: 7.0,
    axis: 'BCN',
    tier: 'A',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes: 'Vila de Gràcia alta demanda.',
  },
  {
    municipality: 'Barcelona',
    district: 'Sant Martí',
    postalCodes: ['08005', '08018', '08019', '08020', '08026'],
    avgEurM2: 5062,
    premiumEurM2: 5062,
    yoyPct: 8.5,
    axis: 'BCN',
    tier: 'A',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes: '22@ / Poblenou como motor de demanda; pisos.com reporta +18,88%.',
  },
  {
    municipality: 'Barcelona',
    district: 'Ciutat Vella',
    postalCodes: ['08001', '08002', '08003'],
    avgEurM2: 4755,
    premiumEurM2: 4755,
    yoyPct: 1.1,
    axis: 'BCN',
    tier: 'A',
    momentum: 'low',
    source: 'Idealista abril 2026',
    notes: 'Gòtic y Born. Crecimiento bajo; 08001 (Raval) con mayor riesgo de banderas rojas.',
  },
  {
    municipality: 'Barcelona',
    district: 'Sants-Montjuïc',
    postalCodes: ['08004', '08014', '08028', '08038'],
    avgEurM2: 4558,
    premiumEurM2: 4558,
    yoyPct: 6.5,
    axis: 'BCN',
    tier: 'A',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes: 'Sants Centre y Hostafrancs son las zonas más caras; 08004 incluye Poble-sec premium.',
  },
  {
    municipality: 'Barcelona',
    district: 'Horta-Guinardó',
    postalCodes: ['08023', '08025', '08035', '08041'],
    avgEurM2: 4004,
    premiumEurM2: 4004,
    yoyPct: 10.6,
    axis: 'BCN',
    tier: 'B',
    momentum: 'high',
    source: 'Idealista abril 2026',
    notes: 'Subidas notables; entrada aún posible.',
  },
  {
    municipality: 'Barcelona',
    district: 'Sant Andreu',
    postalCodes: ['08016', '08020', '08027', '08030', '08038'],
    avgEurM2: 3870,
    premiumEurM2: 3870,
    yoyPct: 8.7,
    axis: 'BCN',
    tier: 'B',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes: 'La Sagrera en revalorización activa.',
  },
  {
    municipality: 'Barcelona',
    district: 'Nou Barris',
    postalCodes: ['08016', '08031', '08033', '08036', '08039', '08042'],
    avgEurM2: 3133,
    premiumEurM2: 3133,
    yoyPct: 17.8,
    axis: 'BCN',
    tier: 'B',
    momentum: 'high',
    source: 'Idealista abril 2026',
    notes: 'Mayor crecimiento BCN, máximo histórico, pero techo de salida más bajo.',
  },
];

// ============================================================================
// EJE 2 — AMB sin BCN (selección por importancia para flipping)
// ============================================================================

const AMB_SIN_BCN: MarketReferenceEntry[] = [
  {
    municipality: 'Sant Just Desvern',
    district: 'Zonas altas residenciales',
    postalCodes: ['08960'],
    avgEurM2: 4442,
    premiumEurM2: 5461,
    yoyPct: 8.1,
    axis: 'AMB',
    tier: 'A',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes: 'Municipio más caro AMB excluyendo BCN. Demanda estructural alta familias.',
  },
  {
    municipality: 'Castelldefels',
    district: 'Platja / Gavà Mar limítrofe',
    postalCodes: ['08860'],
    avgEurM2: 4260,
    premiumEurM2: 5000,
    yoyPct: 6.8,
    axis: 'AMB',
    tier: 'A',
    momentum: 'medium',
    source: 'RealAdvisor 2026',
    notes: 'Demanda internacional + expats. Conexión aeropuerto.',
  },
  {
    municipality: 'Gavà',
    district: 'Gavà Mar',
    postalCodes: ['08850'],
    avgEurM2: 3590,
    premiumEurM2: 5000,
    yoyPct: 6.0,
    axis: 'AMB',
    tier: 'A',
    momentum: 'medium',
    source: 'Mayo 2026',
    notes: 'Zona premium playa con piscina/parcela; producto unifamiliar.',
  },
  {
    municipality: 'Esplugues de Llobregat',
    district: 'La Plana / Can Vidal',
    postalCodes: ['08950'],
    avgEurM2: 3148,
    premiumEurM2: 4468,
    yoyPct: 6.3,
    axis: 'AMB',
    tier: 'A',
    momentum: 'medium',
    source: 'El Llobregat / 2026',
    notes: 'Unifamiliares en partes altas. Adyacente Sarrià.',
  },
  {
    municipality: "L'Hospitalet de Llobregat",
    district: 'Centre / Just Oliveras',
    postalCodes: ['08901', '08902'],
    avgEurM2: 2937,
    premiumEurM2: 4401,
    yoyPct: 12.5,
    axis: 'AMB',
    tier: 'A',
    momentum: 'high',
    source: 'Idealista abril 2026',
    notes: 'Just Oliveras / Cobalt como zona norte límite BCN supera 4.000€/m².',
  },
  {
    municipality: "L'Hospitalet de Llobregat",
    district: 'Santa Eulàlia (zona alta)',
    postalCodes: ['08902'],
    avgEurM2: 3645,
    premiumEurM2: 3645,
    yoyPct: 12.5,
    axis: 'AMB',
    tier: 'B',
    momentum: 'high',
    source: 'Idealista abril 2026',
  },
  {
    municipality: "L'Hospitalet de Llobregat",
    district: "Granvia L'H",
    postalCodes: ['08907', '08908'],
    avgEurM2: 3700,
    premiumEurM2: 3800,
    yoyPct: 12.5,
    axis: 'AMB',
    tier: 'B',
    momentum: 'high',
    source: 'Idealista abril 2026',
    notes: 'Regeneración urbanística + Fira.',
  },
  {
    municipality: "L'Hospitalet de Llobregat",
    district: 'Can Serra - Pubilla Cases',
    postalCodes: ['08905', '08906'],
    avgEurM2: 2869,
    premiumEurM2: 2869,
    yoyPct: 21.8,
    axis: 'AMB',
    tier: 'B',
    momentum: 'high',
    source: 'Idealista abril 2026',
    notes: 'Crecimiento acelerado desde base baja.',
  },
  {
    municipality: "L'Hospitalet de Llobregat",
    district: 'Bellvitge',
    postalCodes: ['08907'],
    avgEurM2: 2853,
    premiumEurM2: 2853,
    yoyPct: 17.9,
    axis: 'AMB',
    tier: 'C',
    momentum: 'high',
    source: 'Idealista abril 2026',
  },
  {
    municipality: "L'Hospitalet de Llobregat",
    district: 'La Florida - Les Planes',
    postalCodes: ['08905'],
    avgEurM2: 2536,
    premiumEurM2: 2536,
    yoyPct: 12.5,
    axis: 'AMB',
    tier: 'C',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes: 'Precio más bajo del municipio.',
  },
  {
    municipality: 'Cornellà de Llobregat',
    district: 'Eje Esplugues (Carretera)',
    postalCodes: ['08940'],
    avgEurM2: 3423,
    premiumEurM2: 3423,
    yoyPct: 10.0,
    axis: 'AMB',
    tier: 'B',
    momentum: 'medium',
    source: 'Engel & Völkers 2026',
    notes: 'Zona más cara, derrame de Esplugues/Sant Just.',
  },
  {
    municipality: 'Cornellà de Llobregat',
    district: 'Centro / Llobregat',
    postalCodes: ['08940'],
    avgEurM2: 2952,
    premiumEurM2: 3100,
    yoyPct: 10.0,
    axis: 'AMB',
    tier: 'B',
    momentum: 'medium',
    source: 'Engel & Völkers 2026',
  },
  {
    municipality: 'Badalona',
    district: 'Port',
    postalCodes: ['08911', '08912'],
    avgEurM2: 2528,
    premiumEurM2: 4800,
    yoyPct: 9.8,
    axis: 'AMB',
    tier: 'A',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes: 'Calles Lleó y Grècia 5.950-6.000 €/m². Zona costa premium.',
  },
  {
    municipality: 'Badalona',
    district: 'Centre / Dalt de la Vila',
    postalCodes: ['08911'],
    avgEurM2: 3801,
    premiumEurM2: 3801,
    yoyPct: 9.8,
    axis: 'AMB',
    tier: 'A',
    momentum: 'medium',
    source: 'Idealista abril 2026',
  },
  {
    municipality: 'Badalona',
    district: 'Casagemes - Canyadó',
    postalCodes: ['08911', '08912'],
    avgEurM2: 3780,
    premiumEurM2: 3780,
    yoyPct: 9.8,
    axis: 'AMB',
    tier: 'B',
    momentum: 'medium',
    source: 'Idealista abril 2026',
  },
  {
    municipality: 'Badalona',
    district: 'Gorg - Progrés',
    postalCodes: ['08912', '08913'],
    avgEurM2: 3302,
    premiumEurM2: 3302,
    yoyPct: 9.8,
    axis: 'AMB',
    tier: 'B',
    momentum: 'medium',
    source: 'Idealista abril 2026',
  },
  {
    municipality: 'Badalona',
    district: 'Bufalà',
    postalCodes: ['08915'],
    avgEurM2: 3247,
    premiumEurM2: 3247,
    yoyPct: 9.8,
    axis: 'AMB',
    tier: 'B',
    momentum: 'medium',
    source: 'Idealista abril 2026',
  },
  {
    municipality: 'Badalona',
    district: 'La Salut - Lloreda',
    postalCodes: ['08914', '08915'],
    avgEurM2: 1731,
    premiumEurM2: 1731,
    yoyPct: 9.8,
    axis: 'AMB',
    tier: 'C',
    momentum: 'medium',
    source: 'Idealista abril 2026',
  },
  {
    municipality: 'Badalona',
    district: 'Sant Roc',
    postalCodes: ['08914'],
    avgEurM2: 1163,
    premiumEurM2: 1163,
    yoyPct: 9.8,
    axis: 'AMB',
    tier: 'D',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes: 'Spread con Port = 3.637 €/m² pero riesgo social documentado. NO flip de momento.',
  },
  {
    municipality: 'Santa Coloma de Gramenet',
    district: 'Centre',
    postalCodes: ['08921', '08922'],
    avgEurM2: 2872,
    premiumEurM2: 2872,
    yoyPct: 12.9,
    axis: 'AMB',
    tier: 'B',
    momentum: 'high',
    source: 'Idealista abril 2026',
    notes: 'Mayor crecimiento. Mercado de entrada AMB.',
  },
  {
    municipality: 'Santa Coloma de Gramenet',
    district: 'El Raval / Riu',
    postalCodes: ['08923'],
    avgEurM2: 2066,
    premiumEurM2: 2066,
    yoyPct: 12.9,
    axis: 'AMB',
    tier: 'C',
    momentum: 'medium',
    source: 'Idealista abril 2026',
  },
  {
    municipality: 'Sant Adrià de Besòs',
    district: 'Frente costero / Can Tondo',
    postalCodes: ['08930'],
    avgEurM2: 2999,
    premiumEurM2: 4724,
    yoyPct: 14.6,
    axis: 'AMB',
    tier: 'A',
    momentum: 'high',
    source: 'Idealista 2026',
    notes: 'Calles Valencia/Nebot estimadas 5.100-5.250 €/m². Transformación urbana activa.',
  },
  {
    municipality: 'Sant Adrià de Besòs',
    district: 'La Mina',
    postalCodes: ['08930'],
    avgEurM2: 1400,
    premiumEurM2: 1500,
    yoyPct: 14.6,
    axis: 'AMB',
    tier: 'D',
    momentum: 'medium',
    source: 'Idealista 2026',
    notes: 'Históricamente deprimido. NO flip de momento.',
  },
];

// ============================================================================
// EJE 3 — Maresme Costa
// ============================================================================

const MARESME: MarketReferenceEntry[] = [
  {
    municipality: 'El Masnou',
    district: 'Ocata',
    postalCodes: ['08320'],
    avgEurM2: 3270,
    premiumEurM2: 4312,
    yoyPct: 1.7,
    axis: 'Maresme',
    tier: 'A',
    momentum: 'low',
    source: 'Fotocasa enero 2026',
    notes: 'Techo Masnou — junto playa, casas con jardín.',
  },
  {
    municipality: 'El Masnou',
    district: 'Califòrnia - Santa Madrona / Alt / Bellresguard',
    postalCodes: ['08320'],
    avgEurM2: 3693,
    premiumEurM2: 3693,
    yoyPct: 1.7,
    axis: 'Maresme',
    tier: 'B',
    momentum: 'low',
    source: 'Fotocasa enero 2026',
  },
  {
    municipality: 'El Masnou',
    district: 'Centre',
    postalCodes: ['08320'],
    avgEurM2: 3494,
    premiumEurM2: 3494,
    yoyPct: 1.7,
    axis: 'Maresme',
    tier: 'B',
    momentum: 'low',
    source: 'Fotocasa enero 2026',
  },
  {
    municipality: 'Vilassar de Mar',
    district: 'Frente marítimo',
    postalCodes: ['08340'],
    avgEurM2: 3691,
    premiumEurM2: 5500,
    yoyPct: 8.9,
    axis: 'Maresme',
    tier: 'A',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes: 'Indomio lo sitúa en 3.831€/m². Techo Maresme sur. Pisos con vistas mar 4.500-5.500.',
  },
  {
    municipality: 'Vilassar de Mar',
    district: 'Interior (zona estación)',
    postalCodes: ['08340'],
    avgEurM2: 3000,
    premiumEurM2: 3200,
    yoyPct: 8.9,
    axis: 'Maresme',
    tier: 'B',
    momentum: 'medium',
    source: 'Idealista abril 2026',
  },
  {
    municipality: 'Montgat',
    district: null,
    postalCodes: ['08390'],
    avgEurM2: 3300,
    premiumEurM2: 3300,
    yoyPct: 2.9,
    axis: 'Maresme',
    tier: 'B',
    momentum: 'low',
    source: 'Hi Homie 2026',
    notes: 'Puerta norte AMB hacia Maresme. Demanda expulsada BCN/Badalona.',
  },
  {
    municipality: 'Alella',
    district: null,
    postalCodes: ['08328'],
    avgEurM2: 3508,
    premiumEurM2: 3508,
    yoyPct: 15.4,
    axis: 'Maresme',
    tier: 'A',
    momentum: 'high',
    source: 'Idealista abril 2026',
    notes: 'Crecimiento dinámico Maresme sur. Residencial alta calidad.',
  },
  {
    municipality: 'Tiana',
    district: null,
    postalCodes: ['08391'],
    avgEurM2: 3200,
    premiumEurM2: 3700,
    yoyPct: 5.8,
    axis: 'Maresme',
    tier: 'B',
    momentum: 'medium',
    source: 'Hi Homie 2026',
    notes: 'Interior sobre Masnou, urbanizaciones de calidad.',
  },
  {
    municipality: 'Premià de Mar',
    district: null,
    postalCodes: ['08330'],
    avgEurM2: 2694,
    premiumEurM2: 3000,
    yoyPct: -0.4,
    axis: 'Maresme',
    tier: 'D',
    momentum: 'negative',
    source: 'Idealista abril 2026',
    notes: 'Único municipio Maresme sur en negativo. NO flip de momento.',
  },
  {
    municipality: 'Premià de Dalt',
    district: null,
    postalCodes: ['08338'],
    avgEurM2: 3147,
    premiumEurM2: 3147,
    yoyPct: 8.74,
    axis: 'Maresme',
    tier: 'B',
    momentum: 'medium',
    source: 'Indomio 2026',
    notes: 'Supera a Premià de Mar (inusual). Demanda urbanizaciones interior.',
  },
  {
    municipality: 'Cabrera de Mar',
    district: null,
    postalCodes: ['08349'],
    avgEurM2: 2852,
    premiumEurM2: 2852,
    yoyPct: 4.3,
    axis: 'Maresme',
    tier: 'C',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes: 'Urbanizaciones parte alta con vistas.',
  },
  {
    municipality: 'Mataró',
    district: null,
    postalCodes: ['08301', '08302', '08303', '08304', '08305'],
    avgEurM2: 2171,
    premiumEurM2: 2800,
    yoyPct: 6.7,
    axis: 'Maresme',
    tier: 'C',
    momentum: 'medium',
    source: 'Idealista abril 2026',
    notes:
      'Capital Maresme. Parte alta y Passeig Citadilla más caras. Mercado primera residencia, buena rentabilidad alquiler.',
  },
  {
    municipality: 'Cabrils',
    district: null,
    postalCodes: ['08348'],
    avgEurM2: 2611,
    premiumEurM2: 2611,
    yoyPct: 14.0,
    axis: 'Maresme',
    tier: 'B',
    momentum: 'high',
    source: 'Idealista abril 2026',
    notes: 'Municipio tranquilo, casas alta calidad, conexión BCN.',
  },
  {
    municipality: 'Argentona',
    district: null,
    postalCodes: ['08310'],
    avgEurM2: 1992,
    premiumEurM2: 1992,
    yoyPct: -9.2,
    axis: 'Maresme',
    tier: 'D',
    momentum: 'negative',
    source: 'Idealista abril 2026',
    notes: 'Caída fuerte. NO flip de momento.',
  },
  {
    municipality: "Caldes d'Estrac",
    district: null,
    postalCodes: ['08393'],
    avgEurM2: 3400,
    premiumEurM2: 3400,
    yoyPct: 5.0,
    axis: 'Maresme',
    tier: 'B',
    momentum: 'medium',
    source: 'Estimación informe',
    notes: 'Caldetes — premium costa norte pequeño.',
  },
  {
    municipality: 'Sant Pol de Mar',
    district: null,
    postalCodes: ['08395'],
    avgEurM2: 3400,
    premiumEurM2: 3400,
    yoyPct: 5.0,
    axis: 'Maresme',
    tier: 'B',
    momentum: 'medium',
    source: 'Estimación informe',
    notes: 'Premium costa norte pequeño.',
  },
];

// ============================================================================
// EJE 4 — Vallès Occidental
// ============================================================================

const VALLES: MarketReferenceEntry[] = [
  {
    municipality: 'Sant Cugat del Vallès',
    district: 'Sant Domènec',
    postalCodes: ['08197'],
    avgEurM2: 4990,
    premiumEurM2: 8979,
    yoyPct: 12.5,
    axis: 'Vallès',
    tier: 'A',
    momentum: 'high',
    source: 'Fotocasa abril 2026',
    notes: 'Barrio residencial más exclusivo del Vallès. Techo absoluto fuera BCN ciudad.',
  },
  {
    municipality: 'Sant Cugat del Vallès',
    district: 'Centre - Estació',
    postalCodes: ['08172'],
    avgEurM2: 4990,
    premiumEurM2: 6492,
    yoyPct: 12.5,
    axis: 'Vallès',
    tier: 'A',
    momentum: 'high',
    source: 'Fotocasa abril 2026',
  },
  {
    municipality: 'Sant Cugat del Vallès',
    district: 'Valldoreix / Mira-sol / La Floresta',
    postalCodes: ['08172', '08197'],
    avgEurM2: 4990,
    premiumEurM2: 6264,
    yoyPct: 12.5,
    axis: 'Vallès',
    tier: 'A',
    momentum: 'high',
    source: 'Fotocasa abril 2026',
    notes: 'Urbanizaciones consolidadas unifamiliares con jardín.',
  },
  {
    municipality: 'Sant Cugat del Vallès',
    district: 'Parc Central',
    postalCodes: ['08172'],
    avgEurM2: 4990,
    premiumEurM2: 6295,
    yoyPct: 12.5,
    axis: 'Vallès',
    tier: 'A',
    momentum: 'high',
    source: 'Fotocasa abril 2026',
  },
  {
    municipality: 'Sant Cugat del Vallès',
    district: 'Turó de Can Mates',
    postalCodes: ['08174'],
    avgEurM2: 4990,
    premiumEurM2: 6160,
    yoyPct: 12.5,
    axis: 'Vallès',
    tier: 'A',
    momentum: 'high',
    source: 'Fotocasa abril 2026',
  },
  {
    municipality: 'Sant Cugat del Vallès',
    district: 'Volpelleres',
    postalCodes: ['08174'],
    avgEurM2: 4990,
    premiumEurM2: 5545,
    yoyPct: 12.5,
    axis: 'Vallès',
    tier: 'A',
    momentum: 'high',
    source: 'Fotocasa abril 2026',
  },
  {
    municipality: 'Sant Cugat del Vallès',
    district: 'El Coll',
    postalCodes: ['08197'],
    avgEurM2: 4990,
    premiumEurM2: 5152,
    yoyPct: 12.5,
    axis: 'Vallès',
    tier: 'A',
    momentum: 'high',
    source: 'Fotocasa abril 2026',
  },
  {
    municipality: 'Cerdanyola del Vallès',
    district: 'Plana del Castell - Montflorit',
    postalCodes: ['08290'],
    avgEurM2: 3021,
    premiumEurM2: 4761,
    yoyPct: 11.4,
    axis: 'Vallès',
    tier: 'A',
    momentum: 'high',
    source: 'Indomio abril 2026',
    notes:
      'Urbanización alta con vistas. Convergencia con Sant Cugat a medio plazo (UAB, Sincrotrón).',
  },
  {
    municipality: 'Cerdanyola del Vallès',
    district: 'Centro residencial',
    postalCodes: ['08290'],
    avgEurM2: 3021,
    premiumEurM2: 3500,
    yoyPct: 11.4,
    axis: 'Vallès',
    tier: 'B',
    momentum: 'high',
    source: 'Indomio abril 2026',
  },
  {
    municipality: 'Cerdanyola del Vallès',
    district: 'Sant Ramon',
    postalCodes: ['08290'],
    avgEurM2: 2930,
    premiumEurM2: 2930,
    yoyPct: 11.4,
    axis: 'Vallès',
    tier: 'B',
    momentum: 'high',
    source: 'Indomio abril 2026',
  },
  {
    municipality: 'Sabadell',
    district: 'Centre / Creu Alta',
    postalCodes: ['08201', '08202'],
    avgEurM2: 2248,
    premiumEurM2: 2800,
    yoyPct: 10.4,
    axis: 'Vallès',
    tier: 'B',
    momentum: 'high',
    source: 'Idealista abril 2026',
    notes: 'Zona premium municipal.',
  },
  {
    municipality: 'Sabadell',
    district: 'Sant Oleguer / Eixample',
    postalCodes: ['08203', '08204'],
    avgEurM2: 2248,
    premiumEurM2: 2400,
    yoyPct: 10.4,
    axis: 'Vallès',
    tier: 'C',
    momentum: 'high',
    source: 'Idealista abril 2026',
  },
  {
    municipality: 'Terrassa',
    district: 'Sant Pere / Cementiri Vell / Centre',
    postalCodes: ['08221', '08222'],
    avgEurM2: 2163,
    premiumEurM2: 2607,
    yoyPct: 4.5,
    axis: 'Vallès',
    tier: 'C',
    momentum: 'medium',
    source: 'Indomio abril 2026',
    notes: 'Zona más cara para maximizar venta en Terrassa.',
  },
  {
    municipality: 'Terrassa',
    district: 'Llevant',
    postalCodes: ['08226'],
    avgEurM2: 1871,
    premiumEurM2: 1871,
    yoyPct: 4.5,
    axis: 'Vallès',
    tier: 'C',
    momentum: 'medium',
    source: 'Indomio abril 2026',
  },
  {
    municipality: 'Rubí',
    district: 'Centre',
    postalCodes: ['08191'],
    avgEurM2: 2312,
    premiumEurM2: 2529,
    yoyPct: 19.1,
    axis: 'Vallès',
    tier: 'B',
    momentum: 'high',
    source: 'Indomio abril 2026',
    notes: 'Mayor crecimiento de toda la zona estudio (efecto derrame Sant Cugat).',
  },
  {
    municipality: 'Rubí',
    district: 'Can Fatjó - Can Ximelis',
    postalCodes: ['08191'],
    avgEurM2: 2312,
    premiumEurM2: 2201,
    yoyPct: 19.1,
    axis: 'Vallès',
    tier: 'C',
    momentum: 'high',
    source: 'Indomio abril 2026',
  },
];

// ============================================================================
// Dataset completo
// ============================================================================

export const MARKET_REFERENCE_2026Q2: MarketReferenceEntry[] = [
  ...BCN_CIUDAD,
  ...AMB_SIN_BCN,
  ...MARESME,
  ...VALLES,
];

/** Fecha de referencia del dataset. Si ha pasado >6 meses, mostrar warning en UI. */
export const MARKET_REFERENCE_DATE = '2026-04-15';

// ============================================================================
// Helpers de consulta
// ============================================================================

/**
 * Devuelve TODOS los CPs únicos del universo del informe. Lista que usan los
 * crawlers para filtrar inventario.
 */
export function getAllUniversePostalCodes(): string[] {
  const set = new Set<string>();
  for (const entry of MARKET_REFERENCE_2026Q2) {
    for (const cp of entry.postalCodes) set.add(cp);
  }
  return Array.from(set).sort();
}

/**
 * Devuelve la entrada MÁS específica del informe para un CP dado.
 *  - Si hay múltiples entries con el mismo CP (típico: BCN), se devuelve la
 *    primera (suele ser el distrito principal). Para refinamiento por barrio
 *    necesitaríamos polígonos GeoJSON (futuro Sprint).
 *  - Si el CP no está en el universo, devuelve null.
 */
export function getReferenceByPostalCode(postalCode: string | null): MarketReferenceEntry | null {
  if (!postalCode) return null;
  return MARKET_REFERENCE_2026Q2.find((e) => e.postalCodes.includes(postalCode)) ?? null;
}

/**
 * Todas las entradas que cubren un CP — útil cuando hay múltiples zonas dentro
 * del mismo CP y queremos elegir según otro criterio (ej. el tier más alto).
 */
export function getAllReferencesByPostalCode(postalCode: string | null): MarketReferenceEntry[] {
  if (!postalCode) return [];
  return MARKET_REFERENCE_2026Q2.filter((e) => e.postalCodes.includes(postalCode));
}

/** Filtra el dataset por tier. */
export function getReferencesByTier(tier: Tier): MarketReferenceEntry[] {
  return MARKET_REFERENCE_2026Q2.filter((e) => e.tier === tier);
}

/**
 * Para una propiedad con CP X, calcula el "precio salida esperado" usando el
 * informe como fuente. Aplica margen de seguridad por defecto del 10% (no
 * asumimos el techo histórico — vender en 7-14 meses al máximo no es realista).
 */
export function estimateSalePricePerM2FromReference(
  postalCode: string | null,
  options: { safetyMarginPct?: number; useMaxPremium?: boolean } = {},
): { eurM2: number; source: string; entry: MarketReferenceEntry } | null {
  const refs = getAllReferencesByPostalCode(postalCode);
  if (refs.length === 0) return null;

  // Si hay varias zonas para el mismo CP, usamos la entrada de mayor premium —
  // representa el techo realista del CP. (Marc puede sobrescribir por sub-zona
  // cuando tengamos polígonos.)
  const sortedDesc = [...refs].sort(
    (a, b) => (b.premiumEurM2 ?? b.avgEurM2) - (a.premiumEurM2 ?? a.avgEurM2),
  );
  const entry = sortedDesc[0];
  if (!entry) return null;

  const base = options.useMaxPremium ? (entry.premiumEurM2 ?? entry.avgEurM2) : entry.avgEurM2;
  const margin = options.safetyMarginPct ?? 0.1;
  const eurM2 = Math.round(base * (1 - margin));

  return { eurM2, source: entry.source, entry };
}
