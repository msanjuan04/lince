import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Lince — Capta inmuebles infravalorados antes que nadie',
  description:
    'Plataforma de captación inmobiliaria automatizada para Catalunya. Detección multi-fuente, valoración con IA y alertas en minutos.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} h-full`}>
      <body className="bg-background text-foreground flex min-h-full flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
