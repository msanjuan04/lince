// Middleware helper para Next.js. Refresca la sesión Supabase en cada request
// y devuelve el supabase user para que el middleware del app decida si redirigir.

import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function updateSupabaseSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('@lince/auth/middleware: faltan NEXT_PUBLIC_SUPABASE_URL/ANON_KEY');
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Llamada obligatoria — refresca el token si está caducado y persiste en cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
