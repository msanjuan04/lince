import { createClient } from '@supabase/supabase-js';

const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!;
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

async function main(): Promise<void> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 10 });
  console.log('--- Users en Supabase Auth ---');
  for (const u of data.users) {
    console.log(
      `  id=${u.id.slice(0, 8)}  phone=${JSON.stringify(u.phone)}  phone_confirmed_at=${u.phone_confirmed_at}`,
    );
  }

  console.log('\n--- signInWithPassword phone=34623808712 (sin +) ---');
  const r1 = await anon.auth.signInWithPassword({ phone: '34623808712', password: '123456' });
  console.log(
    `  Error: ${r1.error?.message ?? 'ninguno'}  User: ${r1.data.user?.id?.slice(0, 8) ?? '—'}`,
  );

  console.log('\n--- signInWithPassword phone=+34623808712 (con +) ---');
  const r2 = await anon.auth.signInWithPassword({ phone: '+34623808712', password: '123456' });
  console.log(
    `  Error: ${r2.error?.message ?? 'ninguno'}  User: ${r2.data.user?.id?.slice(0, 8) ?? '—'}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
