import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, formatEur, sourceLabel } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dealById } from '@/data/deals';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

export function DealDetail({ id }: { id: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const deal = dealById(id);

  if (!deal) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="subtitle">Chollo no encontrado</ThemedText>
      </ThemedView>
    );
  }

  const below = deal.belowZonePct != null ? Math.round(deal.belowZonePct * 100) : null;
  const isOff = deal.feed === 'offmarket';

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={{ uri: deal.imageUrl }}
          style={styles.hero}
          contentFit="cover"
          transition={200}
        />

        <View style={styles.body}>
          <View style={styles.tagsRow}>
            <View
              style={[styles.tag, { backgroundColor: isOff ? Brand.offMarket : Brand.primary }]}
            >
              <ThemedText type="smallBold" style={styles.tagText}>
                {isOff ? '🐆 Off-market' : `🤖 ${sourceLabel(deal.source)}`}
              </ThemedText>
            </View>
            {below != null && (
              <View style={[styles.tag, { backgroundColor: Brand.discount }]}>
                <ThemedText type="smallBold" style={styles.tagText}>
                  −{below}% vs zona
                </ThemedText>
              </View>
            )}
          </View>

          <ThemedText type="title" style={styles.price}>
            {formatEur(deal.price)}
          </ThemedText>
          <ThemedText type="default">{deal.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            📍 {deal.city} · {deal.postalCode}
          </ThemedText>

          {/* Datos clave */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <Row label="Precio" value={formatEur(deal.price)} />
            <Row label="Superficie" value={deal.m2 != null ? `${deal.m2} m²` : '—'} />
            <Row label="Habitaciones" value={deal.rooms != null ? String(deal.rooms) : '—'} />
            <Row label="€/m²" value={deal.pricePerM2 ? `${formatEur(deal.pricePerM2)}/m²` : '—'} />
            <Row
              label="€/m² de la zona"
              value={deal.zoneAvgPricePerM2 ? `${formatEur(deal.zoneAvgPricePerM2)}/m²` : '—'}
            />
            {below != null && <Row label="Descuento vs zona" value={`−${below}%`} />}
          </ThemedView>

          {/* Catastro */}
          {deal.catastro && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold" style={{ marginBottom: Spacing.one }}>
                🏛️ Catastro
              </ThemedText>
              {deal.catastro.yearBuilt && (
                <Row label="Año construcción" value={String(deal.catastro.yearBuilt)} />
              )}
              {deal.catastro.surfaceM2 && (
                <Row label="Superficie catastral" value={`${deal.catastro.surfaceM2} m²`} />
              )}
              {deal.catastro.use && <Row label="Uso" value={deal.catastro.use} />}
            </ThemedView>
          )}

          {/* Off-market: comisión */}
          {isOff && deal.commissionPct != null && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">💰 Comisión al que traiga comprador</ThemedText>
              <ThemedText type="subtitle" style={{ color: Brand.offMarket }}>
                {deal.commissionPct}%
              </ThemedText>
            </ThemedView>
          )}

          {/* IA: link a la web */}
          {!isOff && deal.sourceUrl && (
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync(deal.sourceUrl!)}
              style={[styles.secondaryBtn, { borderColor: theme.backgroundSelected }]}
            >
              <ThemedText type="smallBold" style={{ color: Brand.primary }}>
                🔗 Ver en {sourceLabel(deal.source)}
              </ThemedText>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* CTA fijo */}
      <View
        style={[
          styles.ctaBar,
          { paddingBottom: insets.bottom + Spacing.two, backgroundColor: theme.background },
        ]}
      >
        <Pressable
          style={[styles.cta, { backgroundColor: Brand.primary }]}
          onPress={() =>
            Alert.alert(
              'Interés registrado',
              isOff
                ? 'Avisaremos al lince que subió este chollo. Te pondremos en contacto.'
                : 'Guardado. Te avisaremos de novedades de este chollo.',
            )
          }
        >
          <ThemedText type="smallBold" style={styles.ctaText}>
            {isOff ? 'Me interesa · contactar' : 'Me interesa'}
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#00000010' },
  body: { padding: Spacing.three, gap: Spacing.two },
  tagsRow: { flexDirection: 'row', gap: Spacing.two },
  tag: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half, borderRadius: 999 },
  tagText: { color: Brand.white, fontSize: 12 },
  price: { fontSize: 40, lineHeight: 44 },
  card: { padding: Spacing.three, borderRadius: 16, gap: Spacing.one, marginTop: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  secondaryBtn: {
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  cta: { padding: Spacing.three, borderRadius: 16, alignItems: 'center' },
  ctaText: { color: Brand.white, fontSize: 16 },
});
