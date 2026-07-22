import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/brand';
import { Spacing } from '@/constants/theme';

function Stat({ big, label }: { big: string; label: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="subtitle" style={{ color: Brand.primary }}>
        {big}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

export function Profile() {
  const insets = useSafeAreaInsets();
  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.four }]}>
      <View style={styles.avatarRow}>
        <View style={[styles.avatar, { backgroundColor: Brand.primary }]}>
          <ThemedText type="title" style={{ color: Brand.white, fontSize: 32 }}>
            M
          </ThemedText>
        </View>
        <View>
          <ThemedText type="subtitle">Marc Sanjuan</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            🐆 Lince · Barcelona
          </ThemedText>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat big="3" label="Chollos subidos" />
        <Stat big="40" label="Interesados" />
        <Stat big="1" label="Cerrados" />
      </View>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">💰 Comisiones pendientes</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Cuando se cierre un deal que trajiste, aparecerá aquí.
        </ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.three, gap: Spacing.four },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: {
    flex: 1,
    padding: Spacing.three,
    borderRadius: 16,
    alignItems: 'center',
    gap: Spacing.half,
  },
  card: { padding: Spacing.three, borderRadius: 16, gap: Spacing.one },
});
