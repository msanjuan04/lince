'use client';

import {
  Handshake,
  LayoutDashboard,
  Map,
  MapPin,
  Settings,
  Tag,
  Telescope,
  ScanSearch,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { Agency, User } from '@/lib/data/types';
import { UserMenu } from './UserMenu';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/oportunidades', label: 'Oportunidades', icon: ScanSearch },
  { href: '/oportunidades/mapa', label: 'Mapa', icon: MapPin },
  { href: '/captures', label: 'Captures', icon: Handshake },
  { href: '/listings', label: 'Listings', icon: Tag },
  { href: '/zonas', label: 'Zonas', icon: Map },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
] as const;

const PLAN_LABEL: Record<Agency['plan'], string> = {
  basic: 'Basic',
  pro: 'Pro',
  elite: 'Élite',
  founder: 'Founder',
};

interface AppSidebarProps {
  agency: Agency;
  user: User;
}

export function AppSidebar({ agency, user }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-sidebar-border h-16 justify-center border-b px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
        >
          <div className="bg-foreground text-background flex h-7 w-7 shrink-0 items-center justify-center">
            <Telescope className="size-4" strokeWidth={2} />
          </div>
          <span className="text-base font-medium tracking-[-0.02em] group-data-[collapsible=icon]:hidden">
            Lince
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 pt-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {NAV_ITEMS.map((item) => {
                // Para 'Oportunidades' (sin /mapa), no activar cuando estamos en /oportunidades/mapa
                const active =
                  item.href === '/oportunidades'
                    ? pathname === '/oportunidades'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={active}
                      tooltip={item.label}
                      className="h-9 px-3"
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border gap-4 border-t p-4">
        <div className="text-muted-foreground flex items-center justify-between text-xs group-data-[collapsible=icon]:hidden">
          <span>{agency.name}</span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="bg-highlight size-1.5 rounded-full" />
            <span className="text-foreground">Plan {PLAN_LABEL[agency.plan]}</span>
          </span>
        </div>
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
