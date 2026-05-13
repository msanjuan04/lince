import Link from 'next/link';
import { LoginForm } from './_form';

export const metadata = { title: 'Iniciar sesión' };

export default function LoginPage() {
  return (
    <div className="bg-card border-border rounded-2xl border p-8 shadow-sm">
      <h2 className="text-xl font-semibold">Inicia sesión</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Con tu móvil y el código de 6 dígitos que elegiste al registrarte.
      </p>

      <div className="mt-6">
        <LoginForm />
      </div>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        ¿Aún no tienes cuenta?{' '}
        <Link href="/registro" className="text-foreground underline-offset-4 hover:underline">
          Crea una
        </Link>
      </p>
    </div>
  );
}
