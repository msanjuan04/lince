import { redirect } from 'next/navigation';
import Link from 'next/link';
import { VerifyForm } from './_form';

export const metadata = { title: 'Verifica tu móvil' };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const params = await searchParams;
  const phone = (params.phone ?? '').trim();
  if (!phone) {
    redirect('/registro');
  }

  // Formatear para display: +34 666 12 34 56
  const formatted =
    phone.startsWith('34') && phone.length === 11
      ? `+34 ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7, 9)} ${phone.slice(9)}`
      : `+${phone}`;

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="bg-card border-border w-full max-w-md rounded-2xl border p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Revisa tu WhatsApp</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Te hemos enviado un código a{' '}
          <span className="text-foreground font-medium">{formatted}</span>. Introduce el código
          junto a tu PIN para activar la cuenta.
        </p>

        <div className="mt-6">
          <VerifyForm phone={phone} />
        </div>

        <p className="text-muted-foreground mt-6 text-center text-xs">
          ¿Móvil incorrecto?{' '}
          <Link href="/registro" className="text-foreground underline-offset-4 hover:underline">
            Empezar de nuevo
          </Link>
        </p>
      </div>
    </div>
  );
}
