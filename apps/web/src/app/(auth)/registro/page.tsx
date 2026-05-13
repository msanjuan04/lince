import Link from 'next/link';
import { RegisterForm } from './_form';

export const metadata = { title: 'Crear cuenta' };

export default function RegistroPage() {
  return (
    <div className="bg-card border-border rounded-2xl border p-8 shadow-sm">
      <h2 className="text-xl font-semibold">Crea tu cuenta</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Te enviaremos un código por WhatsApp para verificar tu móvil.
      </p>

      <div className="mt-6">
        <RegisterForm />
      </div>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
