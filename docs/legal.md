# Lince — Restricciones legales, scraping y privacidad

## Scraping — reglas generales

- **Respeta `robots.txt`** de cada sitio.
- **User-Agent identificable**: `LinceBot/1.0 (+https://lince.cat/bot)`.
  - **Excepción Altamira** (aprobada por Marc, 2026-07-22): su WAF devuelve 403 al UA
    identificable y solo sirve a UAs de navegador, aunque su `robots.txt` permite
    `/nodejs/`. Solo el source `altamira` usa UA de navegador para acceder a esos
    datos públicos permitidos. Ningún otro source lo hace.
- **Rate limit defensivo**: portales 1 req/3.5s, banca 1 req/5s, BOE/SAREB/catastro conservador.
- **NO scraping agresivo de Idealista**. Escalar a API oficial (€500-1000/mes, Sprint 6+) si se necesita volumen.

## Mapa de fuentes

**✅ Tier 1 — en producción (smoke OK 2026-07-22):**

- **Pisos.com** — HTML SSR, sin WAF. Rate 3.5s.
- **BOE Subastas** — oficial, HTML clásico. Rate 2.5s.
- **Solvia** — Angular SSR con `ng-state` JSON. Rate 3s. (= escaparate de **Intrum**; `haya.es`→Solvia.)
- **Servihabitat** — HTML Liferay + JSON-LD. Rate 5s.
- **Aliseda** — API JSON interna (`laravel.alisedainmobiliaria.com`), header `application: aliseda`. Rate 5s.
- **Altamira** — API JSON interna (`/nodejs/getResultados`, POST). Requiere UA de navegador (ver excepción arriba). Rate 5s.

**⚠️ Tier 2 — en construcción:**

- **Diglo** (`digloservicer.com`) — HTML SSR sin WAF. Pega: no publica CP (solo provincia+municipio+lat/lon), hay que derivarlo.
- **Hipoges** (`realestate.hipoges.com`) — SPA, API interna por localizar.

**❌ Descartados / no viables:**

- **Idealista** — DataDome. Solo via API oficial (Sprint 6+).
- **Fotocasa / Habitaclia** — Cloudflare/PerimeterX.
- **SAREB oficial** — WAF. Acceder via servicers (Solvia, Aliseda).
- **Anticipa** — sin portal público propio (Hola Pisos muerto); su inventario va por Aliseda.
- **Casaktua** — dominio caído; **Haya** — fusionado en Solvia.

## GDPR

- Postgres en Frankfurt (Supabase eu-central-1).
- Datos personales (nombres, teléfonos) cifrados con pgcrypto cuando aplique.
- Logs sin PII salvo necesario; redactar en producción.
- **Retención**: captures 5 años, leads compradores 2 años, logs app 90 días, logs crawlers 1 año.

## Comunicaciones a terceros

- Registrar consentimiento + opt-out en cada email/WhatsApp a propietarios o compradores.
- Templates WhatsApp Business pre-aprobados por Meta antes de producción.
- Email transaccional: SPF + DKIM + DMARC configurados.
