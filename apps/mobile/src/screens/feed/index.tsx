import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DealCard } from '@/components/deal-card';
import { FeedSegmented } from '@/components/feed-segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, type DealFeed } from '@/constants/brand';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { dealsByFeed } from '@/data/deals';

export function Feed() {
  const insets = useSafeAreaInsets();
  const [feed, setFeed] = useState<DealFeed>('offmarket');
  const deals = useMemo(() => dealsByFeed(feed), [feed]);

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={deals}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => <DealCard deal={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: Spacing.three,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
        ListHeaderComponent={
          <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
            <ThemedText type="title" style={styles.brand}>
              Lince{' '}
              <ThemedText type="title" style={{ color: Brand.primary }}>
                🐆
              </ThemedText>
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
              Chollos inmobiliarios antes que nadie
            </ThemedText>
            <FeedSegmented value={feed} onChange={setFeed} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.count}>
              {deals.length} chollos · ordenados por descuento
            </ThemedText>
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { gap: Spacing.two, marginBottom: Spacing.two },
  brand: { fontSize: 40, lineHeight: 44 },
  tagline: { marginBottom: Spacing.two },
  count: { marginTop: Spacing.two, marginBottom: Spacing.one },
});
