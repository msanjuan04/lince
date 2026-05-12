import { SidebarTrigger } from '@/components/ui/sidebar';

interface TopbarProps {
  title: string;
  description?: string;
  meta?: string;
  actions?: React.ReactNode;
}

export function Topbar({ title, description, meta, actions }: TopbarProps) {
  return (
    <header className="bg-background border-border sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b px-6 sm:px-8">
      <SidebarTrigger className="-ml-2" />
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <h1 className="text-base font-medium tracking-[-0.02em]">{title}</h1>
        {description ? (
          <span className="text-muted-foreground hidden truncate text-sm sm:inline">
            {description}
          </span>
        ) : null}
        {meta ? (
          <span className="text-muted-foreground ml-auto hidden font-mono text-xs tabular-nums sm:inline">
            {meta}
          </span>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
