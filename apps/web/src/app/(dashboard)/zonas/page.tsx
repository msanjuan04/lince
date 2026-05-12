import type { Metadata } from 'next';
import { Topbar } from '@/components/nav/Topbar';
import { getZones } from '@/lib/data/repositories';
import { ZoneList } from './_components/ZoneList';
import { NewZoneButton } from './_components/NewZoneDialog';

export const metadata: Metadata = {
  title: 'Zonas',
};

export default async function ZonasPage() {
  const zones = await getZones();
  const active = zones.filter((z) => z.active).length;

  return (
    <>
      <Topbar
        title="Zonas"
        description="Códigos postales y filtros para alertas en tiempo real"
        meta={`${active} activas · ${zones.length} totales`}
        actions={<NewZoneButton />}
      />
      <div className="flex flex-1 flex-col gap-8 p-6 sm:p-10">
        <ZoneList zones={zones} />
      </div>
    </>
  );
}
