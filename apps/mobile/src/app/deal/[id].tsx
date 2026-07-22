import { useLocalSearchParams } from 'expo-router';

import { DealDetail } from '@/screens/deal-detail';

export default function DealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DealDetail id={id} />;
}
