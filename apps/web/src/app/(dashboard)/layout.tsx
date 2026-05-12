import { AppSidebar } from '@/components/nav/AppSidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getCurrentSession } from '@/lib/data/repositories';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, agency } = await getCurrentSession();

  return (
    <TooltipProvider delay={150}>
      <SidebarProvider>
        <AppSidebar agency={agency} user={user} />
        <SidebarInset className="bg-background flex min-h-screen flex-col">{children}</SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
