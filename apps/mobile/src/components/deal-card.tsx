import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, formatEur, sourceLabel } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Deal } from '@/data/deals';

export function DealCard({ deal }: { deal: Deal }) {
  const theme = useTheme();
  const below = deal.belowZonePct != null ? Math.round(deal.belowZonePct * 100) : null;
  const isOff = deal.feed === 'offmarket';

  return (
    <Link href={`/deal/${deal.id}`} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View>
          <Image
            source={{ uri: deal.imageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={200}
          />

          {/* Tag fuente (off-market vs IA) */}
          <View style={[styles.tag, { backgroundColor: isOff ? Brand.offMarket : Brand.primary }]}>
            <ThemedText type="smallBold" style={styles.tagText}>
              {isOff ? '🐆 Off-market' : `🤖 ${sourceLabel(deal.source)}`}
            </ThemedText>
          </View>

          {/* Badge descuento vs zona */}
          {below != null && (
            <View style={[styles.badge, { backgroundColor: Brand.discount }]}>
              <ThemedText type="smallBold" style={styles.badgeText}>
                −{below}% vs zona
              </ThemedText>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <ThemedText type="subtitle" style={styles.price}>
            {formatEur(deal.price)}
          </ThemedText>
          <ThemedText type="default" numberOfLines={2} style={styles.title}>
            {deal.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {deal.city} · {deal.postalCode}
          </ThemedText>

          <View style={styles.metaRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {deal.m2 != null ? `${deal.m2} m²` : '—'}
              {deal.rooms ? ` · ${deal.rooms} hab` : ''}
              {deal.pricePerM2 ? ` · ${formatEur(deal.pricePerM2)}/m²` : ''}
            </ThemedText>
            <View style={styles.interested}>
              <ThemedText type="small" themeColor="textSecondary">
                ❤️ {deal.interested}
              </ThemedText>
            </View>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const RADIUS = 18;

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS,
    overflow: 'hidden',
    marginBottom: Spacing.three,
  },
  image: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#00000010',
  },
  tag: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
  },
  tagText: { color: Brand.white, fontSize: 12 },
  badge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
  },
  badgeText: { color: Brand.white, fontSize: 12 },
  body: {
    padding: Spacing.three,
    gap: Spacing.half,
  },
  price: { fontSize: 26, lineHeight: 32 },
  title: { fontWeight: '600' },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  interested: { flexDirection: 'row', alignItems: 'center' },
});
