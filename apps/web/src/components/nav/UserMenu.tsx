'use client';

import { ChevronsUpDown, LogOut, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { User } from '@/lib/data/types';
import { formatPhoneEs } from '@/lib/format';

function initials(name: string | null, fallback: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0];
    const second = parts[1];
    if (first && second) {
      return (first.charAt(0) + second.charAt(0)).toUpperCase();
    }
    if (first) return first.slice(0, 2).toUpperCase();
  }
  return fallback.slice(0, 2).toUpperCase();
}

export function UserMenu({ user }: { user: User }) {
  const phoneDisplay = formatPhoneEs(user.phoneE164);
  const secondary = user.email ?? phoneDisplay;
  const display = user.name ?? user.email ?? phoneDisplay;
  const initialFallback = user.email ?? user.phoneE164 ?? 'LI';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-sm p-1.5 outline-none transition-colors group-data-[collapsible=icon]:p-0.5">
        <Avatar className="size-8 shrink-0 rounded-sm">
          <AvatarFallback className="bg-foreground text-background rounded-sm text-xs font-medium">
            {initials(user.name, initialFallback)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col items-start text-left group-data-[collapsible=icon]:hidden">
          <span className="w-full truncate text-sm">{display}</span>
          <span className="text-muted-foreground w-full truncate text-xs">{secondary}</span>
        </div>
        <ChevronsUpDown className="text-muted-foreground size-3.5 group-data-[collapsible=icon]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-56">
        <div className="text-muted-foreground px-1.5 py-1 text-xs">{secondary}</div>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <UserRound className="size-4" />
          Mi perfil
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            // GET /auth/logout limpia la cookie y redirige a /login.
            window.location.href = '/auth/logout';
          }}
        >
          <LogOut className="size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
