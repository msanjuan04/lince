import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/brand';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType ?? 'default'}
        style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      />
    </View>
  );
}

export function PostDeal() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('');
  const [price, setPrice] = useState('');
  const [m2, setM2] = useState('');
  const [commission, setCommission] = useState('3');

  const canPublish = title.length > 3 && city.length > 1 && price.length > 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          padding: Spacing.three,
          paddingTop: insets.top + Spacing.three,
          paddingBottom: BottomTabInset + Spacing.six,
          gap: Spacing.two,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="subtitle">Sube tu chollo 🐆</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Casas fuera de portales. Si un inversor la compra, te llevas comisión.
        </ThemedText>

        {/* Fotos (mock) */}
        <Pressable
          style={[styles.photoBox, { borderColor: theme.backgroundSelected }]}
          onPress={() =>
            Alert.alert('Fotos', 'Aquí abriríamos la cámara / galería (fase Supabase Storage).')
          }
        >
          <ThemedText type="subtitle">＋</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Añadir fotos
          </ThemedText>
        </Pressable>

        <Field
          label="Título"
          value={title}
          onChangeText={setTitle}
          placeholder="Piso a reformar, herencia sin publicar"
        />
        <Field
          label="Municipio"
          value={city}
          onChangeText={setCity}
          placeholder="L'Hospitalet de Llobregat"
        />
        <Field
          label="Precio (€)"
          value={price}
          onChangeText={setPrice}
          placeholder="148000"
          keyboardType="numeric"
        />
        <Field
          label="Superficie (m²)"
          value={m2}
          onChangeText={setM2}
          placeholder="72"
          keyboardType="numeric"
        />
        <Field
          label="Comisión ofrecida (%)"
          value={commission}
          onChangeText={setCommission}
          keyboardType="numeric"
        />

        <Pressable
          disabled={!canPublish}
          onPress={() =>
            Alert.alert(
              '¡Chollo publicado!',
              'Lo verán los inversores del feed off-market. (Demo — sin guardar aún.)',
            )
          }
          style={[
            styles.publish,
            { backgroundColor: canPublish ? Brand.primary : theme.backgroundSelected },
          ]}
        >
          <ThemedText type="smallBold" style={{ color: Brand.white, fontSize: 16 }}>
            Publicar chollo
          </ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  field: { gap: Spacing.one },
  input: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  photoBox: {
    height: 120,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    marginVertical: Spacing.two,
  },
  publish: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 16,
    alignItems: 'center',
  },
});
