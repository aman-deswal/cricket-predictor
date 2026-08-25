import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

interface ScreenStateProps {
  title: string;
  detail: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}

export function ScreenState({
  title,
  detail,
  loading = false,
  actionLabel,
  onAction,
}: ScreenStateProps) {
  return (
    <View style={styles.container}>
      {loading ? <ActivityIndicator color={theme.colors.accent} size="large" /> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={() => void onAction()} style={styles.action}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  detail: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: theme.spacing.sm,
    maxWidth: 340,
    textAlign: 'center',
  },
  action: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  actionText: {
    color: theme.colors.background,
    fontSize: 14,
    fontWeight: '800',
  },
});
