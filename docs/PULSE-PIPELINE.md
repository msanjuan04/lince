# Lince Pulse — Pipeline de scraping y análisis

> Cómo funciona, paso a paso, el sistema que detecta oportunidades inmobiliarias en Catalunya.
> Este documento es **explicativo** — el `CLAUDE.md` raíz es operacional. Si quieres saber **qué hace Lince por dentro**, este es el sitio.
>
> Última actualización: sprint 1 (2026-05-13).

---

## 1. Visión de 30 segundos

El inversor inmobiliario serio gana cuando ve **antes que el mercado** propiedades vendidas por **vendedores motivados** o con **valor latente no reconocido**. Lince Pulse hace eso en piloto automático: cada semana barre fuentes públicas, normaliza los datos, calcula descuentos vs mediana de zona y entrega un ranking accionable.

```
                ┌──────────────────────────────────────────────────────────┐
                │                    LINCE PULSE PIPELINE                  │
                └──────────────────────────────────────────────────────────┘

  Fuentes  ──►  Crawlers  ──►  Normalizador  ──►  DB Supabase  ──►  Análisis  ──►  App / Informe
   ────         ────────       ─────────────      ────────────       ────────       ─────────────
   Pisos.com    fetch HTML +   parsers + signal   60 propiedades     score per     Dashboard,
   BOE          Cheerio        detection         + crawler runs +    property +    listado,
   Solvia       (SSR JSON)     (m², CP, type,    histórico (Fase 2)  agente Pulse   mapa,
                               red flags,        --------------       (Fase 4)      informe
                               condition)        Frankfurt EU                       semanal
```

---

## 2. Mapa de fuentes — qué scrapeamos y por qué

### 2.1 Tier verde — en producción

Estas tres fuentes son **scrapeables directamente** con un cliente HTTP simple (sin browser real), respetan `robots.txt` y nos devuelven datos limpios. Forman el corazón de Pulse v1.

| Fuente           | Tipo                                          | Por qué la queremos                                                                                                                                                                   | Volumen BCN                         |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Pisos.com**    | Portal mainstream                             | Cubre el 60-70% del inventario público de Idealista sin tener WAF agresivo. Tiene anuncios de particulares y de inmobiliarias. Es nuestra **base** de propiedades activas en mercado. | ~200 anuncios/día/CP                |
| **BOE Subastas** | Oficial / subastas judiciales                 | El **vendedor está obligado a vender** (orden del juez). Precios típicos al 70-80% de tasación. Solo Lince mira esto sistemáticamente — la mayoría de inmobiliarias no.               | ~5-15 nuevas/semana en provincia 08 |
| **Solvia**       | Bank-owned servicer (Banco Sabadell → Intrum) | El banco quiere salir de balance, precio **muy negociable**. Bonus único: expone `cuotaAlquiler` estimado → permite calcular yield directo.                                           | ~50-100 inmuebles activos en BCN    |

### 2.2 Tier amarillo — pospuestos a Fase 1.C

Estas fuentes son valiosas pero requieren más trabajo técnico (Playwright, o descubrir API privada):

| Fuente                         | Bloqueo                                                                        | Plan                                                             |
| ------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Aliseda (Santander/Blackstone) | SPA Angular sin SSR. La API JSON existe pero el endpoint exacto no es público. | Playwright con browser headless O ingeniería inversa del bundle. |
| Anticipa (Blackstone)          | Similar a Aliseda — Angular SSR pero la página principal no expone listado.    | Encontrar la URL del listado o usar Playwright.                  |
| Haya / Casaktua / Anida (BBVA) | Dominios cambiados, timeouts en URLs candidatas.                               | Investigar URL vigente.                                          |

### 2.3 Tier rojo — descartados (WAF activo)

Estas fuentes han implementado **medidas técnicas para impedir el scraping**. Por respeto al `robots.txt` espiritual (la fuente NO quiere bots) y por riesgo legal (sentencias firmes en España contra scrapers de portales inmobiliarios), **NO scrapeamos**.

| Fuente            | WAF                                    | Cómo accederíamos                                                                        |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Idealista**     | DataDome (captcha automático)          | Idealista Data API oficial — €500-1000/mes. Sprint 6 cuando tengamos >10 clientes.       |
| **Fotocasa**      | Cloudflare/Akamai (HTTP 403)           | Adevinta partnership (mismo dueño que Habitaclia).                                       |
| **Habitaclia**    | PerimeterX ("Pardon Our Interruption") | Adevinta partnership.                                                                    |
| **Yaencontre**    | DataDome                               | API o partnership.                                                                       |
| **SAREB oficial** | WAF tipo Cloudflare                    | El inventario SAREB pasa por servicers (Anticipa, Solvia, Aliseda) — los scrapeamos ahí. |
| **Altamira**      | Akamai Access Denied                   | Partnership directo.                                                                     |

**Política UA**: usamos User-Agent `LinceBot/1.0 (+https://lince.cat/bot)` — identificable. Si alguna fuente del Tier amarillo en el futuro requiere browser-real, primero probamos UA híbrido `Chrome ... LinceBot/1.0` (identificable como bot pero con string de browser). Solo en último caso bajamos a UA Chrome puro, documentando la excepción y respetando estrictamente `robots.txt` paths y rate limit. **Nunca evadimos captchas ni WAFs**.

---

## 3. Anatomía de un crawler — cómo se scrapea cada fuente

Cada fuente tiene su módulo en `workers/crawler-portales/src/sources/`. Todos implementan la misma interfaz:

```ts
interface CrawlerSource {
  readonly name: string; // 'pisos', 'boe', 'solvia'
  crawl(opts: CrawlOptions): Promise<CrawlOutcome>;
}
```

El **orchestrator** (`orchestrator.ts`) envuelve cualquier crawler con auditoría: crea una fila en `crawler_runs`, ejecuta el `crawl()`, hace `upsertProperty` por cada resultado, y al final actualiza la fila con contadores (`propertiesFound`, `propertiesNew`, `propertiesUpdated`) y errores. Si un upsert individual falla, registra el error pero sigue con los siguientes.

### 3.1 Pisos.com — portal mainstream con paginación

**URL listado:**

```
https://www.pisos.com/venta/pisos-barcelona_capital/[página]/
```

**Paso 1 — paginate listado**: HTTP GET con UA Lince + rate limit 3.5s/req. Cheerio parsea el HTML servidor-renderizado y extrae todos los `<a href="/comprar/...-{id}_{x}/">` con regex.

**Paso 2 — fetch detalle**: por cada URL única recogida, HTTP GET del detalle.

**Paso 3 — parsear**: extrae con Cheerio + regex tolerantes:

- `address` del `<h1>` de la ficha.
- `price` de `[class*="price"]` o `[itemprop="price"]`.
- `m²`, `rooms`, `bathrooms`, `yearBuilt` con regex sobre features `<li>` + descripción + og:description.
- `postalCode` del slug breadcrumb (`piso-eixample08019-...`) o del texto.
- `description` larga de `[class*="description"]`.
- `condition`: detección heurística por regex (`'a reformar'`, `'obra nueva'`, etc.) — ver §5.2.
- `hasTerrace`, `hasElevator`: regex en descripción + features.
- `redFlags`: regex sobre descripción (okupación, VPO, cargas) — ver §5.3.

**Filtro estricto provincia**: descartamos cualquier resultado cuyo CP NO empieza por `08`, `17`, `25` o `43` (las 4 provincias catalanas). En los listados de Pisos.com a veces aparecen propiedades de otras provincias.

**source_id**: el patrón `/comprar/piso-<slug>-<id1>_<id2>/` nos da source*id = `{id1}*{id2}`(combinación estable). El upsert es idempotente por`(source, source_id)`.

### 3.2 BOE Subastas — formulario PHP con paginación

**URL listado** (provincia 08, inmuebles, estado "En ejecución"):

```
https://subastas.boe.es/subastas_ava.php?
  campo[2]=SUBASTA.ESTADO.CODIGO&dato[2]=EJ&
  campo[3]=BIEN.TIPO&dato[3]=I&
  campo[8]=BIEN.COD_PROVINCIA&dato[8]=08&
  page_hits=40&
  sort_field[0]=SUBASTA.FECHA_FIN&sort_order[0]=desc&
  accion=Buscar
```

**Paso 1 — collect subastaIds**: paginamos el listado y extraemos `idSub` de cada `<a href="./detalleSubasta.php?idSub=SUB-AT-2026-26R0886001002">`. Máximo 10 páginas × 40 = 400 ids por provincia (cap de seguridad).

**Paso 2 — dos fetches por subasta**:

- `?ver=1` (por defecto): tiene los datos de la **subasta** (valor de salida, tasación, fechas).
- `?ver=3`: tiene los datos del **bien** subastado (dirección, CP, ref catastral, descripción legal, situación posesoria, cargas).

Hacemos los dos fetches para combinar todo.

**Paso 3 — parsear**: BOE estructura la ficha como `<table><tr><th>Label</th><td>Value</td></tr>`. Recogemos todo el HTML, usamos Cheerio para iterar las filas y construir un mapa `{ label_normalizado: valor }`:

```
{
  descripcion: "100% PLENO DOMINIO. URBANA.- DEPARTAMENTO...",
  direccion: "CR DE L'AMETLLA 26 1 -1 18",
  codigo_postal: "08530",
  localidad: "LA GARRIGA",
  provincia: "Barcelona",
  referencia_catastral: "0448002DG4104N0063RS",
  cargas: "5.715,62 €",
  visitable: "No",
  situacion_posesoria: "No consta",
  valor_subasta: "13.883,88 €",
  tasacion: "19.599,50 €",
  ...
}
```

**Detección automática de banderas rojas** desde estos campos estructurados:

- Si `cargas` contiene cifras: `red_flags += 'has_charges'`.
- Si `visitable` empieza por "No": `red_flags += 'not_visitable'`.
- Si `situacion_posesoria` contiene `ocupad|inquilino|arrenda`: `red_flags += 'occupied'`.
- Plus regex de descripción (VPO, sin cédula, etc.).

**source_id** = `idSub` (formato `SUB-AT-2026-26R0886001002`).

**Tipo del bien**: el `<h4>` de la ficha lo declara: `Bien 1 - Inmueble (Garaje)` o `(Vivienda)`. Lo parseamos con regex.

**Limitación conocida**: el BOE escribe la superficie en **letras** dentro de la descripción ("TIENE UNA SUPERFICIE DE QUINCE METROS SESENTA DECÍMETROS"). Nuestro parser numérico no la coge — para BOE `m²` queda null. En Pulse v2 lo derivaremos via referencia catastral (Catastro abierto da m² estructurado).

### 3.3 Solvia — bank-owned servicer, Angular SSR

**Truco gordo**: Solvia es un Angular SPA pero hace **SSR (Server-Side Rendering)**. El HTML que sirve incluye un `<script id="ng-state" type="application/json">` con **todo el estado inicial de Angular**, incluido `propertyBasicDetail` con TODOS los datos del inmueble en JSON estructurado.

```html
<script id="ng-state" type="application/json">
  {
    "propertyBasicDetail": {
      "id": "54362-26977-O",
      "precio": 220000,
      "m2": 72,
      "cp": "08019",
      "direccion": "C/ Villarroel",
      "poblacion": { "name": "Barcelona" },
      "cuotaAlquiler": 890,
      "caracteristicas": {
        "refCatastral": "9422416DF2892C0007YA",
        "reformar": false,
        "estado": "Obra Nueva",
        "vpo": false,
        "amueblado": false,
        ...
      },
      "textoDescripcion": "Oportunidad sólo para inversores. Debido al estado ocupacional del activo...",
      "campanya": { "name": "para inversores" },
      "enSituacionEspecial": "0"
    },
    ...
  }
</script>
```

**Esto nos da datos PERFECTOS sin Playwright**: precio real, m² con decimales, CP, ref catastral, condition estructurada (`reformar: boolean`), `vpo: boolean`, descripción legal completa, y bonus **`cuotaAlquiler`** = alquiler estimado mensual → permite calcular yield bruto directo.

**Paso 1 — sitemap**: `https://www.solvia.es/sitemap_comprar_viviendas.xml` lista 181 municipios de provincia Barcelona como URLs `/es/comprar/viviendas/barcelona/{municipio}`.

**Paso 2 — listado por municipio**: HTTP GET del HTML del municipio. Cheerio extrae todos los `<a href="/es/propiedades/comprar/...">` (los enlaces individuales a cada propiedad).

**Paso 3 — fetch detalle + parsear JSON**: por cada URL individual, descargamos el HTML, extraemos el `<script id="ng-state">` con regex, parseamos como JSON, y leemos `propertyBasicDetail`.

**Detección de banderas rojas** desde el JSON estructurado:

- `caracteristicas.vpo === true` → `'vpo'`.
- `enSituacionEspecial === '1'` ó descripción con `ocupacional|inquilino|arrendat` → `'occupied'`.
- `mostrarPrecio === 'N'` → `'hidden_price'`.
- Más regex sobre descripción (cargas, sin cédula).

**Detección de condition** estructurada:

- `caracteristicas.reformar === true` → `'needs_reform'`.
- `caracteristicas.estado` mapeado: `"Obra Nueva"` → `'new'`, `"reformado"` → `'recently_reformed'`, etc.

**source_id** desde el patrón URL `/piso-{ciudad}-{X}-dormitorios-{id1}-{id2}` → `{id1}-{id2}`.

---

## 4. Anatomía técnica — qué hace cada paquete

```
packages/
├── db/              # Cliente Prisma + repositorios + scripts
├── crawlers-core/   # Helpers compartidos (rate limit, HTTP, parsers)
├── ai/              # Prompts y wrapper Claude (Fase 4)
├── shared/          # Types y utils transversales
└── ui/              # Componentes compartidos web/landing

workers/
└── crawler-portales/   # Tres módulos source + orchestrator + CLI

apps/
├── web/             # Dashboard inmobiliaria (la app que usas)
└── landing/         # Landing comercial
```

### 4.1 `packages/crawlers-core` — los cimientos del scraping

- **`user-agent.ts`**: la constante `LINCE_USER_AGENT = 'LinceBot/1.0 (+https://lince.cat/bot)'`. Una sola fuente de verdad.
- **`rate-limit.ts`**: clase `RateLimiter` con cola FIFO. Garantiza al menos `minIntervalMs` entre el **inicio** de dos requests al mismo host. Un limiter por fuente (3000ms para Solvia, 2500ms para BOE, 3500ms para Pisos.com). Backoff exponencial con jitter al recibir 429/503.
- **`http.ts`**: wrapper sobre `fetch` nativo de Node 22. Inyecta UA Lince + Accept-Language `es-ES`, gestiona timeout, reintenta hasta 2 veces en 429/503 con backoff. Si el server devuelve un código distinto y no-OK, lanza `HttpError` con status + URL + body truncado para auditoría.
- **`normalize.ts`**: los parsers tolerantes a formato heterogéneo del mercado español:
  - `parseSquareMeters("85 m²")` → 85; soporta `"85m2"`, `"85,5 m²"`, `"superficie 85 metros"`.
  - `parsePriceEur("285.000 €")` → 285000; soporta `"285000€"`, `"285.000,50 €"`, `"€ 285.000"`.
  - `parseFloor("5ª planta")` → `"5"`; `"planta baja"` → `"baja"`; `"ático"` → `"atico"`.
  - `detectCondition(text)` → `'needs_reform' | 'partial_reform' | 'good' | 'recently_reformed' | 'new' | 'unknown'`. Regex con keywords del mercado español.
  - `detectTerrace`, `detectElevator`, `detectOrientation`: regex sobre descripción.
  - `detectRedFlags(text)` → array. Patrones: `okupado|ocupación|sin contrato`, `con inquilino|contrato vigente`, `VPO|vivienda protección`, `con cargas|deudas|embargo`, `sin cédula habitabilidad`, `sin licencia|construcción ilegal|fuera de ordenación`.
  - `hashDescription(text)` → SHA-256 truncado a 32 chars. Usado para detectar cambios de descripción entre runs (Fase 2 — histórico).
  - `provinceFromPostalCode(cp)` → `"Barcelona" | "Girona" | "Lleida" | "Tarragona" | null` por prefijo.
  - `pricePerM2(price, m2)` → cálculo con 2 decimales.

### 4.2 `packages/db` — Prisma + repositorios

- **`prisma/schema.prisma`**: schema versionado. Modelo `Property` con campos para los buckets de oportunidad (description, condition, hasTerrace, hasElevator, isBankOwned, isAuction, redFlags, auctionStartingPrice). Modelo `CrawlerRun` para auditoría.
- **`prisma/migrations/`**: migraciones versionadas. La inicial `20260512212525_pulse_phase_1_initial` crea el schema entero.
- **`src/index.ts`**: cliente Prisma global (con cache para evitar reconexiones en dev) + re-exports de los repositorios.
- **`src/repositories/properties.ts`**: `upsertProperty(input)`. Lookup por `(source, sourceId)`, decide si es nuevo o existente, persiste y devuelve un `UpsertResult` con flags `isNew`, `priceChanged`, `descriptionChanged` y los valores previos (preparado para que en Fase 2 inserte en `price_history` y `description_history`).
- **`src/repositories/crawler-runs.ts`**: `startCrawlerRun(source)` crea la fila con `status='running'`. `finishCrawlerRun(id, payload)` la actualiza con contadores y errores.
- **`scripts/inspect-db.ts`**: utilidad CLI para listar tablas y contar filas. Útil para verificar el estado de la DB.
- **`scripts/verify-phase1.ts`**: reporte rich del estado de Fase 1 — runs, distribución por fuente, cobertura de campos, buckets detectables, top 5 por €/m².

### 4.3 `workers/crawler-portales` — el motor

- **`src/sources/types.ts`**: la interfaz `CrawlerSource` y los tipos compartidos.
- **`src/sources/{solvia,boe,pisos}.ts`**: los tres crawlers descritos en §3.
- **`src/orchestrator.ts`**: `runSource(source, opts)`. Arranca un run, ejecuta `source.crawl()`, persiste con `upsertProperty`, finaliza el run con counts y errores.
- **`src/index.ts`**: CLI con flags `--source <name>`, `--postal CP,CP`, `--max N`. Conecta el source seleccionado al orchestrator.
- **`src/probe-crawl.ts`**: script de prueba sin DB — ejecuta el `crawl()` y vuelca a stdout. Útil para iterar parsers sin contaminar Supabase.

### 4.4 `apps/web` — la app que ves

- **`src/lib/data/db.ts`**: adaptador Prisma → tipos UI. Calcula `zoneAvgPricePerM2` por CP (`AVG(price_per_m2)` agrupado, excluyendo subastas para no sesgar a la baja) y el `opportunityScore` heurístico (ver §5.1). Aplica fallbacks razonables para campos null del scraping (centroide CP para lat/lng, "Sin dirección" para address, mapeo de type, etc.).
- **`src/lib/data/repositories.ts`**: capa pública. Tiene un check `hasRealData()` que mira si la tabla `properties` tiene >0 filas → si sí, usa Prisma; si no, fallback a mocks (útil en local sin haber corrido el crawler).
- **`(dashboard)/dashboard/page.tsx`**: home con KPIs, top 5, distribución por fuente, buckets.
- **`(dashboard)/oportunidades/`**: tabla densa con filtros y sheet de detalle. Toda la lógica de filtros ya existente reutiliza la nueva data real.
- **`(dashboard)/oportunidades/mapa/`**: Leaflet con CircleMarker por propiedad, coloreado por bucket. Tamaño proporcional al score.

---

## 5. Análisis — cómo se identifican las oportunidades

### 5.1 `opportunityScore` — heurística v1 (Fase 4 lo reemplazará con Claude)

Para cada propiedad calculamos:

```ts
// 1. Mediana €/m² de la zona (CP) — excluyendo subastas porque sesgan a la baja
zoneAvg = AVG(price_per_m2 WHERE postal_code = X AND is_auction = false)

// 2. Delta porcentual
delta = (zoneAvg - propertyPricePerM2) / zoneAvg

// 3. Score lineal: -50% = 100, 0% = 0, +50% = 0 (clamp 0..100)
score = clamp(delta * 200, 0, 100)

// 4. Bonus por ser subasta (Bucket B inherente)
if (isAuction) score = clamp(score + 15, 0, 100)
```

Ejemplo real de la DB actual:

- Piso CP 08019 a 1.364€/m² (precio: 82.000€, m²: 60) vs zoneAvg 08019 ≈ 5.500€/m² → delta = 75% → score = 100 (clamp).
- Piso CP 08024 a 5.000€/m² vs zoneAvg 5.516€/m² → delta = 9% → score = 19.

Cuando la Fase 4 (agente Pulse con Claude) entre, el score se enriquecerá con:

- Factores cualitativos del texto (urgencia del vendedor, oportunidades de mercado).
- Bonus/malus por banderas rojas.
- Ajuste por condition (reforma → score +5).
- Detección de premium oculto (terraza no mencionada en título, ático sin premium).

### 5.2 Los 6 buckets de oportunidad

Lo que un inversor inmobiliario serio busca **no es solo "el más barato"** — es donde hay **margen entre precio actual y valor real**. Aparece en seis patrones distintos:

| Bucket                                   | Qué detecta                                                           | Cómo se calcula                                                                                        | Por qué es oportunidad                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **A — Vendedor desesperado**             | Conductual: muchas rebajas, mucho tiempo en mercado, lenguaje urgente | Fase 2 (histórico precios). De momento usamos regex en descripción ("venta urgente", "negociable").    | El vendedor está mentalmente preparado para bajar más. La oferta -15% pasa.                                 |
| **B — Origen institucional**             | Subastas BOE + bank-owned (Solvia, etc.)                              | `isAuction = true` o `isBankOwned = true`.                                                             | Banco/juez sin apego emocional. Descuento estructural. **Ojo a banderas rojas**: ocupación, cargas.         |
| **C — Margen de reforma**                | Condition = `needs_reform` + precio bajo + m² >60                     | Detectado en parser (Pisos.com regex, Solvia campo `reformar`).                                        | Reforma BCN ≈ 600-1000€/m². Comprador final paga premium por "listo para entrar" — el delta es el margen.   |
| **D — Cambio de uso / valor latente**    | Locales convertibles, pisos divisibles, edificios completos           | Heurística sobre type + descripción. Mejorable en Fase 4.                                              | El 95% del mercado no mira esto. Premium grande para quien sí.                                              |
| **E — Premium oculto no valorado**       | Terraza/ático sin destacar, finca regia, orientación sur              | `hasTerrace = true` y/o `hasElevator = true` cuando el resto de datos no se traduce en precio premium. | Vendedor infravalora su activo. Compras a precio "normal", revendes con el premium ya marketing-en marcado. |
| **F — Yield para inversión patrimonial** | Yield bruto > 5% y precio < 250k€                                     | Calcula con `cuotaAlquiler` de Solvia × 12 / precio. Estima con benchmark de zona para otras fuentes.  | Inversor patrimonial (médico, abogado con caja) quiere rentabilidad estable.                                |

Estos buckets son la **estructura del informe semanal Pulse** que se construirá en Fase 3-4.

### 5.3 Banderas rojas — alertas, no descartes

Estas señales NO eliminan automáticamente la propiedad — alertan al inversor para que no pierda tiempo:

| Flag                   | Detectado por                        | Riesgo                                               |
| ---------------------- | ------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `occupied`             | Texto: `okupa                        | ocupación                                            | inquilino sin contrato`; Solvia: `enSituacionEspecial='1'`o "estado ocupacional" en descripción; BOE:`situacion_posesoria`con`ocupad/inquilino` | Difícil/imposible visitar antes de comprar. Proceso de desalojo costoso (1-3 años). Tasación oficial limitada → no financiable hipoteca convencional. |
| `has_tenant`           | Texto: `con inquilino                | alquilado                                            | contrato vigente`                                                                                                                               | Inquilino tiene derecho de tanteo. Renta puede ser baja.                                                                                              |
| `vpo`                  | Texto: `VPO                          | protección oficial                                   | precio máximo limitado`; Solvia: `vpo: true`                                                                                                    | Precio de venta limitado por ley. No flippable.                                                                                                       |
| `has_charges`          | Texto: `con cargas                   | deudas                                               | embargo                                                                                                                                         | hipoteca pendiente`; BOE: campo `cargas` con cifras                                                                                                   | Comprador asume las cargas → precio efectivo = precio + cargas. |
| `no_habitability`      | Texto: `sin cédula de habitabilidad` | No se puede alquilar legalmente sin la cédula.       |
| `illegal_construction` | Texto: `sin licencia                 | construcción ilegal                                  | fuera de ordenación`                                                                                                                            | Riesgo de demolición forzosa o regularización costosa.                                                                                                |
| `not_visitable`        | BOE: campo `visitable: No`           | Compras a ciegas.                                    |
| `hidden_price`         | Solvia: `mostrarPrecio: N`           | No se publica el precio — necesita contacto directo. |

### 5.4 `zoneAvgPricePerM2` — la mediana de zona

Se calcula al vuelo en una query agregada al cargar el dashboard / listado:

```sql
SELECT postal_code, AVG(price_per_m2)::float AS avg_eur_m2
FROM properties
WHERE postal_code IS NOT NULL
  AND price_per_m2 IS NOT NULL
  AND is_auction = false  -- excluir subastas para no sesgar a la baja
GROUP BY postal_code
```

**Nota técnica**: estamos usando media (`AVG`), no mediana real. Para volúmenes bajos (los actuales) la diferencia no es crítica. Cuando tengamos >1000 propiedades por CP, migraremos a `PERCENTILE_CONT(0.5)` que sí es mediana real (PostgreSQL la soporta nativamente).

---

## 6. Ciclo de vida de un crawl

```
1. CLI:      pnpm --filter @lince/crawler-portales crawl --source pisos --max 25
                                  │
                                  ▼
2. parseArgs → { source: 'pisos', maxItems: 25 }
                                  │
                                  ▼
3. runSource(new PisosSource(), opts):
     │
     ├──► startCrawlerRun('pisos')         # INSERT crawler_runs (status=running)
     │                                       returns: { id, startedAt }
     │
     ├──► source.crawl(opts):
     │       │
     │       ├──► RateLimiter.schedule(fetch listado pag 1) ──► HTML
     │       ├──► Cheerio extrae URLs detalle del HTML
     │       ├──► (repite paginación hasta cap)
     │       │
     │       ├──► Por cada URL detalle:
     │       │       RateLimiter.schedule(fetch detalle) ──► HTML
     │       │       parseDetail(HTML) ──► PropertyUpsertInput
     │       │
     │       └──► return { results: [...], errors: [...] }
     │
     ├──► Por cada result:
     │       upsertProperty(input):
     │         - findUnique({ source_sourceId: { source, sourceId } })
     │         - si existe: UPDATE con diff (priceChanged, descriptionChanged)
     │         - si no: INSERT con first_seen = now
     │         - last_seen = now siempre
     │
     └──► finishCrawlerRun(runId, {
            status: 'ok' | 'partial' | 'error',
            propertiesFound: N,
            propertiesNew: M,
            propertiesUpdated: K,
            errors: [...]
          })

4. exit 0 + JSON resumen por stdout
```

**Idempotencia**: si corres el mismo crawl dos veces seguidas:

- La primera vez: 25 new, 0 updated.
- La segunda vez: 0 new, 25 updated (last_seen actualizado, descripción/precio si cambiaron).

Esto es lo que permitirá el **histórico de precios** de Fase 2: cada vez que el precio cambia, en lugar de solo actualizar `properties.price`, también insertamos una fila en `price_history` con timestamp.

---

## 7. Cómo se conecta todo a la app

```
DB Supabase Frankfurt
   │
   ▼
@lince/db (Prisma client)
   │
   ▼
apps/web/src/lib/data/db.ts (adaptador con fallbacks + score heurístico)
   │
   ▼
apps/web/src/lib/data/repositories.ts (capa pública con check hasRealData())
   │
   ▼
React Server Components (dashboard/oportunidades/mapa/oportunidades/[id])
   │
   ▼
HTML servido al navegador
```

**Fallback a mocks**: si la DB está vacía (0 filas en `properties`), `repositories.ts` automáticamente usa los datos mock para que la UI funcione localmente sin necesidad de haber corrido el crawler. Esto se desactivará cuando tengamos datos siempre presentes en producción.

---

## 8. Roadmap inmediato

### Fase 1.C — más fuentes (cuando toque)

- [ ] Aliseda con Playwright o API descubierta.
- [ ] Anticipa con Playwright o API descubierta.
- [ ] Haya / Casaktua / Anida — URLs vigentes.
- [ ] Catastro como **enriquecedor** (no fuente de listings): dada una ref catastral, traer m², año, uso, polígono. Útil para rellenar huecos de Pisos.com y BOE.

### Fase 2 — histórico y cron

- [ ] Tablas `price_history` y `description_history`.
- [ ] `upsertProperty` inserta en histórico cuando hay cambios.
- [ ] BullMQ + Redis para cron semanal.
- [ ] Cada lunes a las 6:00: dispara crawl de todas las fuentes Tier verde + Tier amarillo.

### Fase 3 — alertas y zonas funcionales

- [ ] Modelo `Zone` operativo: el inversor crea CP + filtros, recibe email al detectar match.
- [ ] Resend para email transaccional.

### Fase 4 — agente Pulse

- [ ] Wrapper Claude en `packages/ai/src/pulse-agent.ts`.
- [ ] Prompt v1 documentado en `packages/ai/src/prompts/pulse-agent.ts`.
- [ ] Sustituye el `opportunityScore` heurístico por uno con razonamiento cualitativo + argumentos de negociación + oferta sugerida.
- [ ] Informe semanal `pulse_reports` con top 5 + buckets + narrative.

### Fase 5+ — captación, marketing, multi-tenant real

- Captures (CRM): pipeline kanban con sustitución de mocks por DB.
- Listings (marketing): ficha SEO con Claude, foto IA con Replicate, distribución XML.
- Auth.js v5 + multi-tenancy RLS en Supabase: cada inmobiliaria/inversor ve solo sus zones, captures, listings.

---

## Apéndice — comandos útiles

```bash
# Correr un crawler concreto
pnpm --filter @lince/crawler-portales crawl --source pisos --max 25
pnpm --filter @lince/crawler-portales crawl --source boe --max 15
pnpm --filter @lince/crawler-portales crawl --source solvia --max 20

# Probe sin DB (validar parsers contra datos reales)
pnpm --filter @lince/crawler-portales exec tsx src/probe-crawl.ts pisos --max 3

# Ver estado de la DB
pnpm --filter @lince/crawler-portales exec tsx ../../packages/db/scripts/verify-phase1.ts

# Inspect rapido de tablas
pnpm --filter @lince/crawler-portales exec tsx ../../packages/db/scripts/inspect-db.ts

# Arrancar la app
pnpm --filter @lince/web dev
```

Para correr cualquier comando que toca la DB, asegúrate de tener `.env.local` con `DATABASE_URL` y `DIRECT_URL` configurados (ver §10 del `CLAUDE.md` raíz).
