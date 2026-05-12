'use client';

import { ChevronsUpDown, LogOut, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { User } from '@/lib/data/types';

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0];
    const second = parts[1];
    if (first && second) {
      return (first.charAt(0) + second.charAt(0)).toUpperCase();
    }
    if (first) return first.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function UserMenu({ user }: { user: User }) {
  const display = user.name ?? user.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-sm p-1.5 outline-none transition-colors group-data-[collapsible=icon]:p-0.5">
        <Avatar className="size-8 shrink-0 rounded-sm">
          <AvatarFallback className="bg-foreground text-background rounded-sm text-xs font-medium">
            {initials(user.name, user.email)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col items-start text-left group-data-[collapsible=icon]:hidden">
          <span className="w-full truncate text-sm">{display}</span>
          <span className="text-muted-foreground w-full truncate text-xs">{user.email}</span>
        </div>
        <ChevronsUpDown className="text-muted-foreground size-3.5 group-data-[collapsible=icon]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-56">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <UserRound className="size-4" />
          Mi perfil
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <LogOut className="size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
