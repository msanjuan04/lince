import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TabButton = forwardRef<View, TabTriggerSlotProps>(
  ({ children, isFocused, ...props }, ref) => (
    <Pressable ref={ref} {...props} style={styles.tabBtn}>
      <ThemedText type="smallBold" style={{ color: isFocused ? Brand.primary : undefined }}>
        {children}
      </ThemedText>
    </Pressable>
  ),
);
TabButton.displayName = 'TabButton';

export default function TabsWebLayout() {
  const theme = useTheme();
  return (
    <Tabs>
      <TabSlot />
      <TabList asChild>
        <View
          style={StyleSheet.flatten([styles.bar, { backgroundColor: theme.backgroundElement }])}
        >
          <TabTrigger name="index" href="/" asChild>
            <TabButton>🏠 Chollos</TabButton>
          </TabTrigger>
          <TabTrigger name="subir" href="/subir" asChild>
            <TabButton>＋ Subir</TabButton>
          </TabTrigger>
          <TabTrigger name="perfil" href="/perfil" asChild>
            <TabButton>👤 Perfil</TabButton>
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingVertical: Spacing.two,
  },
  tabBtn: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.three },
});
