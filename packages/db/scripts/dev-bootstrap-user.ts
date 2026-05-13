// Script de bootstrap admin para crear un usuario DEV con WhatsApp ya
// verificado, saltándose el flujo OTP (que requiere Meta WhatsApp Business
// activo). Útil para que el founder/equipo pueda entrar a la app antes de
// tener producción real con OTP.
//
// Uso:
//   set -a && . .env.local && set +a
//   pnpm --filter @lince/db exec tsx scripts/dev-bootstrap-user.ts \
//     --phone 34623808712 \
//     --pin 123456 \
//     --name "Marc Sanjuan" \
//     --role inversor_directo \
//     --agency "Lince (desarrollo)"
//
// Después: abre http://localhost:3000/login, mete el móvil + PIN, listo.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { prisma, type PulseRole } from '../src/index';

interface Args {
  phone: string;
  pin: string;
  name: string;
  role: PulseRole;
  agencyName: string;
}

const VALID_ROLES: PulseRole[] = ['inmobiliaria', 'buying_agent', 'inversor_directo', 'flipper'];

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> & { role?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const v = argv[i + 1];
    if (!a) continue;
    switch (a) {
      case '--phone':
        out.phone = (v ?? '').replace(/\D/g, '');
        i += 1;
        break;
      case '--pin':
        out.pin = v ?? '';
        i += 1;
        break;
      case '--name':
        out.name = v ?? '';
        i += 1;
        break;
      case '--role':
        out.role = v ?? '';
        i += 1;
        break;
      case '--agency':
        out.agencyName = v ?? '';
        i += 1;
        break;
    }
  }
  // Defaults
  if (!out.phone) throw new Error('Falta --phone (formato 34xxxxxxxxx, sin +)');
  if (!out.pin || !/^\d{6}$/.test(out.pin)) throw new Error('Falta --pin de 6 dígitos');
  if (!out.name) out.name = `Cuenta ${out.phone}`;
  if (!out.role) out.role = 'inversor_directo';
  if (!VALID_ROLES.includes(out.role as PulseRole)) {
    throw new Error(`--role inválido. Permitidos: ${VALID_ROLES.join(', ')}`);
  }
  if (!out.agencyName) out.agencyName = `Cuenta ${out.phone}`;
  return out as Args;
}

async function adminClient(): Promise<SupabaseClient> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !serviceKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const e164 = args.phone; // ya viene sin + ni espacios
  const phoneSupabase = `+${e164}`;

  console.log(`\n=== Lince dev bootstrap ===`);
  console.log(`  Phone:       ${phoneSupabase}`);
  console.log(`  PIN:         ${args.pin}`);
  console.log(`  Name:        ${args.name}`);
  console.log(`  Role:        ${args.role}`);
  console.log(`  Agency:      ${args.agencyName}\n`);

  const admin = await adminClient();

  // 1) Crear / actualizar user en Supabase Auth (phone + password=PIN, phone_confirm:true)
  let supabaseUserId: string | null = null;

  // ¿Existe ya en Lince DB por phoneE164?
  const existingDb = await prisma.user.findUnique({ where: { phoneE164: e164 } });
  if (existingDb?.supabaseUserId) {
    console.log(`User Lince ya existe con supabaseUserId=${existingDb.supabaseUserId}`);
    // Actualizamos password y confirmamos phone por si acaso
    const { error } = await admin.auth.admin.updateUserById(existingDb.supabaseUserId, {
      password: args.pin,
      phone: phoneSupabase,
      phone_confirm: true,
    });
    if (error) throw new Error(`updateUserById falló: ${error.message}`);
    supabaseUserId = existingDb.supabaseUserId;
  } else {
    // Crear nuevo. Si ya existe en Supabase Auth (por phone), recuperamos su id.
    const { data, error } = await admin.auth.admin.createUser({
      phone: phoneSupabase,
      password: args.pin,
      phone_confirm: true,
      user_metadata: { name: args.name, pulse_role: args.role },
    });
    if (error) {
      // Quizá ya existe → buscar por phone
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list.users.find((u) => u.phone === e164 || u.phone === phoneSupabase);
      if (!found) throw new Error(`createUser falló y no encontrado: ${error.message}`);
      const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
        password: args.pin,
        phone_confirm: true,
      });
      if (updErr) throw new Error(`updateUserById falló: ${updErr.message}`);
      supabaseUserId = found.id;
      console.log(`Supabase user ya existía, actualizado: ${supabaseUserId}`);
    } else {
      supabaseUserId = data.user.id;
      console.log(`Supabase user creado: ${supabaseUserId}`);
    }
  }

  if (!supabaseUserId) throw new Error('No se pudo determinar supabaseUserId');

  // 2) Upsert agency (si no existe, crear). Reutilizamos por nombre.
  let agency = await prisma.agency.findFirst({ where: { name: args.agencyName } });
  if (!agency) {
    agency = await prisma.agency.create({
      data: {
        name: args.agencyName,
        plan: 'founder',
        pulseRole: args.role,
      },
    });
    console.log(`Agency creada: ${agency.id} "${agency.name}"`);
  } else {
    console.log(`Agency reutilizada: ${agency.id} "${agency.name}"`);
  }

  // 3) Upsert user en Lince DB
  const user = await prisma.user.upsert({
    where: { phoneE164: e164 },
    create: {
      phoneE164: e164,
      supabaseUserId,
      whatsappVerifiedAt: new Date(),
      name: args.name,
    },
    update: {
      supabaseUserId,
      whatsappVerifiedAt: new Date(),
      name: args.name,
    },
  });
  console.log(`User Lince upserted: ${user.id}`);

  // 4) AgencyMember (owner)
  await prisma.agencyMember.upsert({
    where: { agencyId_userId: { agencyId: agency.id, userId: user.id } },
    create: { agencyId: agency.id, userId: user.id, role: 'owner' },
    update: { role: 'owner' },
  });
  console.log(`AgencyMember owner asegurado.`);

  console.log(`\n✓ Listo. Entra en http://localhost:3000/login`);
  console.log(`  · Teléfono: +${e164}`);
  console.log(`  · PIN:      ${args.pin}\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
