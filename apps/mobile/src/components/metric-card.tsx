import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

export function MetricCard({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, accent && styles.accent]}>{value}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flex: 1,
    minWidth: 145,
    padding: theme.spacing.lg,
  },
  label: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  value: {
    color: theme.colors.text,
    fontSize: 27,
    fontWeight: '900',
    marginTop: theme.spacing.xs,
  },
  accent: {
    color: theme.colors.accent,
  },
  detail: {
    color: theme.colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
});
