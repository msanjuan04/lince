# Lince — Restricciones legales, scraping y privacidad

## Scraping — reglas generales

- **Respeta `robots.txt`** de cada sitio.
- **User-Agent identificable**: `LinceBot/1.0 (+https://lince.cat/bot)`.
- **Rate limit defensivo**: portales 1 req/3.5s, banca 1 req/5s, BOE/SAREB/catastro conservador.
- **NO scraping agresivo de Idealista**. Escalar a API oficial (€500-1000/mes, Sprint 6+) si se necesita volumen.

## Mapa de fuentes

**✅ Tier 1 — en producción:**

- **Pisos.com** — HTML SSR, sin WAF. Rate 3.5s.
- **BOE Subastas** — oficial, HTML clásico. Rate 2.5s.
- **Solvia** — Angular SSR con `ng-state` JSON. Rate 3s.

**⚠️ Tier 2 — pospuesto a iteración 1.B:**

- **Aliseda** — SPA Angular, requiere Playwright o API descubierta.
- **Haya, Casaktua, Anida** — timeouts/SSL, URL a verificar.

**❌ Tier rojo — WAF activo, descartados:**

- **Idealista** — DataDome. Solo via API oficial (Sprint 6+).
- **Fotocasa / Habitaclia** — Cloudflare/PerimeterX.
- **SAREB oficial** — WAF. Acceder via servicers (Solvia, Aliseda).
- **Altamira** — Akamai.

## GDPR

- Postgres en Frankfurt (Supabase eu-central-1).
- Datos personales (nombres, teléfonos) cifrados con pgcrypto cuando aplique.
- Logs sin PII salvo necesario; redactar en producción.
- **Retención**: captures 5 años, leads compradores 2 años, logs app 90 días, logs crawlers 1 año.

## Comunicaciones a terceros

- Registrar consentimiento + opt-out en cada email/WhatsApp a propietarios o compradores.
- Templates WhatsApp Business pre-aprobados por Meta antes de producción.
- Email transaccional: SPF + DKIM + DMARC configurados.
