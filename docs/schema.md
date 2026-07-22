# Lince — Schema de base de datos

Prisma sobre Postgres (Supabase). Schema vive en `packages/db/prisma/schema.prisma`.

## SQL de referencia

```sql
-- Multi-tenant: cada inmobiliaria es un agency
CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('basic','pro','elite','founder')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE
);
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE agency_members (
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','agent','admin')),
  PRIMARY KEY (agency_id, user_id)
);
-- Propiedades capturadas (global, no multi-tenant)
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_url TEXT,
  type TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  province TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  cadastral_ref TEXT,
  m2 INTEGER,
  rooms INTEGER,
  bathrooms INTEGER,
  year_built INTEGER,
  price NUMERIC(12,2),
  price_per_m2 NUMERIC(10,2),
  zone_avg_price_per_m2 NUMERIC(10,2),
  opportunity_score NUMERIC(5,2),
  status TEXT,
  raw_data JSONB,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source, source_id)
);
CREATE INDEX idx_properties_postal ON properties(postal_code);
CREATE INDEX idx_properties_score ON properties(opportunity_score DESC);
CREATE INDEX idx_properties_geo ON properties(lat, lng);
-- Zonas que cada inmobiliaria monitoriza
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT,
  geometry JSONB,
  postal_codes TEXT[],
  filters JSONB,
  alert_channels TEXT[],
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Pipeline de captación
CREATE TABLE captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id),
  status TEXT CHECK (status IN ('new','contacted','meeting','signed','lost')),
  notes TEXT,
  owner_name TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  proposal_pdf_url TEXT,
  contacted_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  deal_value NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Listings
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id UUID REFERENCES captures(id),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  ficha_seo_text TEXT,
  photos JSONB,
  staging_photos JSONB,
  price NUMERIC(12,2),
  status TEXT CHECK (status IN ('draft','live','sold','withdrawn')),
  distributed_to TEXT[],
  views_count INTEGER DEFAULT 0,
  leads_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Leads de compradores
CREATE TABLE listing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id),
  agency_id UUID REFERENCES agencies(id),
  name TEXT,
  email TEXT,
  phone TEXT,
  source TEXT,
  message TEXT,
  status TEXT CHECK (status IN ('new','contacted','qualified','lost','closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Auditoría de runs de crawler
CREATE TABLE crawler_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  status TEXT,
  properties_found INTEGER,
  properties_new INTEGER,
  properties_updated INTEGER,
  errors JSONB,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);
-- RLS
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members see own agency zones"
  ON zones FOR SELECT
  USING (agency_id IN (
    SELECT agency_id FROM agency_members WHERE user_id = auth.uid()
  ));
```

## Notas de modelado

- `properties` es global (sin `agency_id`) — se capta una vez y todas las agencies la ven según sus zonas.
- `captures` y `listings` son por agency — ahí entra RLS.
- `raw_data` JSONB guarda el payload original para reprocesar si cambia el parser.

## Prompt del valuator (referencia)

```ts
// packages/ai/src/valuator.ts
async function scoreProperty(property: Property): Promise<{ score: number; rationale: string }> {
  const zoneStats = await getZoneStats(property.postal_code, property.type);
  const baseDelta = (zoneStats.median - property.price_per_m2) / zoneStats.median;
  const baseScore = Math.max(0, Math.min(100, baseDelta * 200));
  const qualitative = await claude.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 500,
    messages: [{ role: 'user', content: buildValuatorPrompt(property, zoneStats, baseScore) }],
  });
  const adjusted = parseAdjustedScore(qualitative);
  return { score: adjusted.score, rationale: adjusted.rationale };
}
```

El prompt completo vive en `packages/ai/src/prompts/valuator.ts`.
