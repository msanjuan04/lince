import type { Metadata } from 'next';
import { Topbar } from '@/components/nav/Topbar';
import { StatCard } from '@/components/shared/StatCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { getListingLeads, getListingStats, getListings } from '@/lib/data/repositories';
import { ListingsGrid } from './_components/ListingsGrid';
import { LeadsTable } from './_components/LeadsTable';

export const metadata: Metadata = {
  title: 'Listings',
};

export default async function ListingsPage() {
  const [listings, leads, stats] = await Promise.all([
    getListings(),
    getListingLeads(),
    getListingStats(),
  ]);

  return (
    <>
      <Topbar
        title="Listings"
        description="Inmuebles publicados a la venta"
        meta={`${stats.live} en vivo · ${stats.leads} leads`}
        actions={
          <Button size="sm" variant="outline">
            Nuevo listing
          </Button>
        }
      />
      <div className="flex flex-1 flex-col gap-10 p-6 sm:gap-12 sm:p-10">
        <section className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          <StatCard label="Listings" value={stats.total} />
          <StatCard label="En vivo" value={stats.live} hint="publicados" />
          <StatCard label="Vistas" value={stats.views.toLocaleString('es-ES')} hint="acumuladas" />
          <StatCard
            label="Leads"
            value={stats.leads}
            hint="recibidos"
            emphasized={stats.leads > 0}
          />
        </section>

        <Tabs defaultValue="listings" className="gap-6">
          <TabsList>
            <TabsTrigger value="listings">
              Listings
              <span className="text-muted-foreground ml-1.5 font-mono text-xs tabular-nums">
                {listings.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="leads">
              Leads
              <span className="text-muted-foreground ml-1.5 font-mono text-xs tabular-nums">
                {leads.length}
              </span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="listings" className="mt-2">
            <ListingsGrid listings={listings} />
          </TabsContent>
          <TabsContent value="leads" className="mt-2">
            <LeadsTable leads={leads} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
