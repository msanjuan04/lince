import Link from 'next/link';

const FEATURES = [
  {
    title: 'Detectar',
    description:
      'Idealista, Fotocasa, Habitaclia, subastas BOE, SAREB y banca. Una sola fuente de verdad, normalizada y deduplicada con catastro.',
  },
  {
    title: 'Valorar',
    description:
      'Score de oportunidad por inmueble basado en mediana €/m² del CP y análisis cualitativo con Claude. Aparece la ganga, te llega antes que a nadie.',
  },
  {
    title: 'Captar',
    description:
      'Mini-CRM de captación con propuesta personalizada, plantillas WhatsApp y email. Del primer contacto a la firma sin salir de Lince.',
  },
];

const PLANS = [
  {
    name: 'Basic',
    price: '99 €',
    cadence: '/mes',
    pitch: 'Inmobiliaria local, 1 zona',
    features: [
      'Portales públicos (Idealista, Fotocasa, Habitaclia)',
      'Hasta 1 zona configurada',
      'Alertas por email',
      'Mini-CRM de captación',
    ],
    highlight: false,
  },
  {
    name: 'Pro',
    price: '249 €',
    cadence: '/mes',
    pitch: 'BCN/Maresme, hasta 3 zonas',
    features: [
      'Todo lo de Basic',
      'Subastas BOE + SAREB',
      'Distribución multi-portal',
      'Alertas WhatsApp',
      'Hasta 3 zonas',
    ],
    highlight: true,
  },
  {
    name: 'Élite',
    price: '499 €',
    cadence: '/mes',
    pitch: 'Costa Brava + escala completa',
    features: [
      'Todo lo de Pro',
      'Banca (Aliseda, Solvia, Haya, Casaktua, Anida)',
      'Foto IA + home staging',
      'Retargeting',
      'Zonas ilimitadas',
    ],
    highlight: false,
  },
];

export default function LandingPage() {
  return (
    <>
      <header className="border-border border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground flex h-7 w-7 items-center justify-center rounded-sm text-xs font-bold tracking-tight">
              L
            </div>
            <span className="text-sm font-semibold tracking-tight">Lince</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <a href="#como-funciona" className="text-muted-foreground hover:text-foreground">
              Cómo funciona
            </a>
            <a href="#planes" className="text-muted-foreground hover:text-foreground">
              Planes
            </a>
            <a
              href="http://localhost:3000"
              className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-medium"
            >
              Entrar
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-border border-b">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center sm:py-32">
            <span className="border-border text-muted-foreground rounded-full border px-3 py-1 text-xs">
              B2B SaaS para inmobiliarias en Catalunya
            </span>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Capta inmuebles infravalorados antes que la competencia.
            </h1>
            <p className="text-muted-foreground max-w-xl text-base sm:text-lg">
              Lince detecta oportunidades en minutos desde que se publican y te da el flujo completo
              para captarlas y venderlas. Multi-fuente, valoración con IA, mini-CRM y distribución
              multi-portal.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href="#planes"
                className="bg-primary text-primary-foreground rounded-md px-5 py-2.5 text-sm font-medium"
              >
                Empezar 14 días gratis
              </a>
              <a
                href="http://localhost:3000"
                className="border-border hover:bg-muted rounded-md border px-5 py-2.5 text-sm font-medium"
              >
                Ver demo
              </a>
            </div>
            <p className="text-muted-foreground text-xs">
              Sin tarjeta · 30 días de devolución · Programa Lince Founder al 50% para los 10
              primeros
            </p>
          </div>
        </section>

        <section id="como-funciona" className="border-border border-b">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <header className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                De portal abierto a piso firmado en exclusiva.
              </h2>
              <p className="text-muted-foreground mt-3 text-sm sm:text-base">
                Tres pasos. Lo que antes te llevaba un equipo de 3 personas haciendo scraping manual
                y hojas de cálculo, ahora es una herramienta.
              </p>
            </header>
            <div className="grid gap-px overflow-hidden rounded-lg border sm:grid-cols-3">
              {FEATURES.map((f, i) => (
                <article key={f.title} className="bg-background flex flex-col gap-3 p-6">
                  <div className="text-muted-foreground text-xs tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <h3 className="text-base font-semibold tracking-tight">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="planes" className="border-border border-b">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <header className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Un plan por inmobiliaria, sin letra pequeña.
              </h2>
              <p className="text-muted-foreground mt-3 text-sm sm:text-base">
                14 días gratis sin tarjeta. Si en 30 días no captas un piso, te devolvemos lo
                pagado.
              </p>
            </header>
            <div className="grid gap-3 sm:grid-cols-3">
              {PLANS.map((plan) => (
                <article
                  key={plan.name}
                  className={
                    'flex flex-col gap-4 rounded-lg border p-6 ' +
                    (plan.highlight
                      ? 'border-foreground bg-foreground/[0.03]'
                      : 'border-border bg-background')
                  }
                >
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-base font-semibold tracking-tight">{plan.name}</h3>
                    {plan.highlight ? (
                      <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
                        Más elegido
                      </span>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-xs">{plan.pitch}</p>
                  <p className="font-semibold tracking-tight">
                    <span className="text-3xl">{plan.price}</span>
                    <span className="text-muted-foreground text-sm font-normal">
                      {plan.cadence}
                    </span>
                  </p>
                  <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <span
                          aria-hidden
                          className="text-foreground/60 mt-1 size-1 rounded-full bg-current"
                        />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <a
                    href="http://localhost:3000"
                    className={
                      'mt-2 rounded-md px-4 py-2 text-center text-sm font-medium ' +
                      (plan.highlight
                        ? 'bg-primary text-primary-foreground'
                        : 'border-border hover:bg-muted border')
                    }
                  >
                    Empezar con {plan.name}
                  </a>
                </article>
              ))}
            </div>
            <p className="text-muted-foreground mt-8 text-center text-xs">
              Programa <span className="text-foreground font-medium">Lince Founder</span>: 50%
              durante 6 meses para los 10 primeros, a cambio de testimonio + caso de uso público +
              feedback semanal.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-border bg-muted/30 border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs sm:flex-row">
          <span>© 2026 Lince · Captación inmobiliaria automatizada para Catalunya</span>
          <span>
            Hecho en Barcelona por{' '}
            <a href="https://gnerai.com" className="hover:text-foreground underline">
              GNERAI
            </a>
          </span>
        </div>
      </footer>
    </>
  );
}
