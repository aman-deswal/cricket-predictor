import type { DashboardData } from '@sixsense/domain';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AccuracyTrend } from '@/components/accuracy-trend';
import { CalibrationPanel } from '@/components/calibration-panel';
import { MetricCard } from '@/components/metric-card';
import { ScreenState } from '@/components/screen-state';
import { getDashboardData } from '@/services/results';
import { theme } from '@/theme';

function accuracyLabel(total: number, accuracy: number): string {
  return total > 0 ? `${Math.round(accuracy * 100)}%` : '—';
}

export default function DashboardScreen() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setDashboard(await getDashboardData());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard metrics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return <ScreenState title="Loading dashboard" detail="Calculating model performance." loading />;
  }
  if (error || !dashboard) {
    return (
      <ScreenState
        title="Dashboard unavailable"
        detail={error ?? 'Unable to load dashboard metrics.'}
        actionLabel="Try again"
        onAction={loadDashboard}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadDashboard(true)}
          tintColor={theme.colors.accent}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>MODEL PERFORMANCE</Text>
        <Text style={styles.title}>Trust dashboard</Text>
        <Text style={styles.subtitle}>Accuracy, scoring quality, trend, and calibration from verified outcomes.</Text>
      </View>

      <View style={styles.metrics}>
        <MetricCard
          accent
          label="OVERALL ACCURACY"
          value={accuracyLabel(dashboard.stats.total, dashboard.stats.accuracy)}
          detail={`${dashboard.stats.correct} of ${dashboard.stats.total} correct`}
        />
        <MetricCard
          label="AVERAGE BRIER"
          value={dashboard.stats.avgBrier === null ? '—' : dashboard.stats.avgBrier.toFixed(3)}
          detail={dashboard.stats.avgBrier === null ? 'No scored probabilities' : 'Lower is better'}
        />
        <MetricCard
          label="INTERNATIONAL"
          value={accuracyLabel(
            dashboard.split.international.total,
            dashboard.split.international.accuracy,
          )}
          detail={`${dashboard.split.international.total} scored matches`}
        />
        <MetricCard
          label="LEAGUE"
          value={accuracyLabel(dashboard.split.league.total, dashboard.split.league.accuracy)}
          detail={`${dashboard.split.league.total} scored matches`}
        />
      </View>

      <AccuracyTrend data={dashboard.trend} />
      <CalibrationPanel bins={dashboard.calibration} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  hero: {
    marginBottom: theme.spacing.xs,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginTop: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: theme.spacing.xs,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
});
