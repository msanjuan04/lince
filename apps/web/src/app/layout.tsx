import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: {
    default: 'Lince',
    template: '%s · Lince',
  },
  description: 'Captación inmobiliaria automatizada para Catalunya',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${jetbrains.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground flex min-h-full flex-col font-sans antialiased">
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
