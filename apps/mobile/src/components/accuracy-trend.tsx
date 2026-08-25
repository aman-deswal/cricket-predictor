import type { AccuracyTrendPoint } from '@sixsense/domain';
import { StyleSheet, Text, View } from 'react-native';

import { DetailSection, detailStyles } from '@/components/detail-section';
import { theme } from '@/theme';

export function AccuracyTrend({ data }: { data: AccuracyTrendPoint[] }) {
  if (data.length === 0) {
    return (
      <DetailSection title="Accuracy trend" eyebrow="ROLLING 10 MATCHES">
        <Text style={detailStyles.muted}>Ten scored predictions are needed before a rolling trend is available.</Text>
      </DetailSection>
    );
  }

  const visible = data.slice(-16);

  return (
    <DetailSection title="Accuracy trend" eyebrow="ROLLING 10 MATCHES">
      <View style={styles.chart}>
        {visible.map((point) => (
          <View key={`${point.date}-${point.accuracy}`} style={styles.column}>
            <View style={styles.track}>
              <View style={[styles.bar, { height: `${Math.max(point.accuracy * 100, 3)}%` }]} />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <Text style={detailStyles.muted}>
          {new Date(visible[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </Text>
        <Text style={styles.current}>{Math.round(visible.at(-1)?.accuracy ?? 0)}% current</Text>
      </View>
    </DetailSection>
  );
}

const styles = StyleSheet.create({
  chart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 4,
    height: 130,
  },
  column: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  track: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: 3,
    height: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    backgroundColor: theme.colors.accent,
    borderRadius: 3,
    minHeight: 3,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  current: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
});
