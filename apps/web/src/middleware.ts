// Middleware Next.js — refresca la sesión Supabase en cada request y bloquea
// el dashboard si no hay usuario autenticado y con email verificado.

import { NextResponse, type NextRequest } from 'next/server';
import { updateSupabaseSession } from '@lince/auth/middleware';

// Rutas públicas que NO requieren sesión.
const PUBLIC_PATHS = ['/login', '/registro', '/auth/verify', '/auth/logout'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  // Estáticos de Next, favicon, etc. (el matcher debería filtrarlos, doble seguro).
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSupabaseSession(request);
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    // Si el usuario YA tiene sesión válida (phone confirmado) e intenta volver al
    // login/registro, mandarlo al dashboard.
    if (user?.phone_confirmed_at && (pathname === '/login' || pathname === '/registro')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return response;
  }

  // Toda otra ruta (incluida `/`) requiere sesión con móvil verificado.
  if (!user || !user.phone_confirmed_at) {
    const url = new URL('/login', request.url);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - Public assets (svg, png, jpg, jpeg, gif, webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
