import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { MatchWithPredictions } from '@sixsense/domain';

import { MatchCard } from '@/components/match-card';
import { ScreenState } from '@/components/screen-state';
import { getUpcomingMatches } from '@/data/matches';
import { theme } from '@/theme';

export default function MatchesScreen() {
  const [matches, setMatches] = useState<MatchWithPredictions[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMatches = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      setMatches(await getUpcomingMatches());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load matches.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  if (loading) {
    return <ScreenState title="Loading matches" detail="Syncing the latest SixSense slate." loading />;
  }

  if (error) {
    return <ScreenState title="Matches unavailable" detail={error} actionLabel="Try again" onAction={loadMatches} />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadMatches(true)}
          tintColor={theme.colors.accent}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LIVE PREDICTION CENTER</Text>
        <Text style={styles.title}>Upcoming matches</Text>
        <Text style={styles.subtitle}>
          Deterministic picks and probabilities, refreshed from the same data source as the web app.
        </Text>
      </View>

      {matches.length > 0 ? (
        matches.map((match) => <MatchCard key={match.match_id} match={match} />)
      ) : (
        <ScreenState title="No scheduled matches" detail="Pull to refresh when the next fixtures are published." />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  hero: {
    marginBottom: theme.spacing.sm,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    marginTop: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: theme.spacing.sm,
  },
});
