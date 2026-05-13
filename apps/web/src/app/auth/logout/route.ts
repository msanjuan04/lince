import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@lince/auth/server';

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}

export async function GET(request: Request) {
  return POST(request);
}
