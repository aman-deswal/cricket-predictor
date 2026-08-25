import type { CalibrationBin } from '@sixsense/domain';
import { StyleSheet, Text, View } from 'react-native';

import { DetailSection, detailStyles } from '@/components/detail-section';
import { theme } from '@/theme';

export function CalibrationPanel({ bins }: { bins: CalibrationBin[] }) {
  if (bins.length === 0) {
    return (
      <DetailSection title="Calibration" eyebrow="MODEL TRUST">
        <Text style={detailStyles.muted}>Calibration bins are not available yet. This does not affect current predictions.</Text>
      </DetailSection>
    );
  }

  return (
    <DetailSection title="Calibration" eyebrow="PREDICTED VS ACTUAL">
      <Text style={[detailStyles.muted, styles.explainer]}>
        Smaller gaps indicate that confidence tracks observed outcomes more closely.
      </Text>
      {bins.map((bin) => {
        const gap = Math.abs(bin.predicted_avg - bin.actual_avg);
        return (
          <View key={`${bin.bin_center}-${bin.count}`} style={styles.row}>
            <View style={styles.bin}>
              <Text style={styles.binLabel}>{Math.round(bin.predicted_avg * 100)}% predicted</Text>
              <Text style={styles.count}>{bin.count} matches</Text>
            </View>
            <Text style={styles.actual}>{Math.round(bin.actual_avg * 100)}% actual</Text>
            <Text style={[styles.gap, gap <= 0.05 && styles.goodGap]}>{Math.round(gap * 100)} pt gap</Text>
          </View>
        );
      })}
    </DetailSection>
  );
}

const styles = StyleSheet.create({
  explainer: {
    marginBottom: theme.spacing.sm,
  },
  row: {
    alignItems: 'center',
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingVertical: theme.spacing.md,
  },
  bin: {
    flex: 1,
  },
  binLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  count: {
    color: theme.colors.muted,
    fontSize: 9,
    marginTop: 2,
  },
  actual: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    marginHorizontal: theme.spacing.md,
  },
  gap: {
    color: theme.colors.negative,
    fontSize: 9,
    fontWeight: '800',
    width: 52,
  },
  goodGap: {
    color: theme.colors.positive,
  },
});
