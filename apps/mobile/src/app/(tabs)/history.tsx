import { summarizeAccuracy, type PredictionHistoryItem } from '@sixsense/domain';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HistoryCard } from '@/components/history-card';
import { ScreenState } from '@/components/screen-state';
import { getPredictionHistory } from '@/services/results';
import { theme } from '@/theme';

type OutcomeFilter = 'all' | 'correct' | 'incorrect';

const FILTERS: Array<{ value: OutcomeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'correct', label: 'Correct' },
  { value: 'incorrect', label: 'Missed' },
];

export default function HistoryScreen() {
  const [history, setHistory] = useState<PredictionHistoryItem[]>([]);
  const [filter, setFilter] = useState<OutcomeFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setHistory(await getPredictionHistory());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load prediction history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const filtered = useMemo(
    () => history.filter((item) => (
      filter === 'all' || (filter === 'correct' ? item.correct : !item.correct)
    )),
    [filter, history],
  );
  const summary = summarizeAccuracy(history);

  if (loading) {
    return <ScreenState title="Loading history" detail="Syncing scored prediction outcomes." loading />;
  }
  if (error) {
    return <ScreenState title="History unavailable" detail={error} actionLabel="Try again" onAction={loadHistory} />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadHistory(true)}
          tintColor={theme.colors.accent}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>VERIFIED OUTCOMES</Text>
        <Text style={styles.title}>{summary.total} scored predictions</Text>
        <Text style={styles.accuracy}>
          {summary.total > 0 ? `${Math.round(summary.accuracy * 100)}% all-time accuracy` : 'No scored outcomes yet'}
        </Text>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((option) => {
          const active = option.value === filter;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={option.value}
              onPress={() => setFilter(option.value)}
              style={[styles.filter, active && styles.activeFilter]}
            >
              <Text style={[styles.filterText, active && styles.activeFilterText]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {filtered.length > 0 ? (
        filtered.map((item) => <HistoryCard item={item} key={item.prediction_id} />)
      ) : (
        <ScreenState title="No matching outcomes" detail="Choose another filter or pull to refresh." />
      )}
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
  accuracy: {
    color: theme.colors.muted,
    fontSize: 13,
    marginTop: theme.spacing.xs,
  },
  filters: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  filter: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  activeFilter: {
    backgroundColor: theme.colors.accentMuted,
    borderColor: theme.colors.accent,
  },
  filterText: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  activeFilterText: {
    color: theme.colors.accent,
  },
});
