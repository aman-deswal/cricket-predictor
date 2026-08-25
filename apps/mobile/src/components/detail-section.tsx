import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

export function DetailSection({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

export const detailStyles = StyleSheet.create({
  muted: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  body: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
});

const styles = StyleSheet.create({
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    padding: theme.spacing.lg,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 3,
  },
  title: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  body: {
    marginTop: theme.spacing.md,
  },
});
