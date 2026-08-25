import type { MatchDetails } from '@sixsense/domain';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EdgeScoreCard } from '@/components/edge-score-card';
import { EnrichmentPanel } from '@/components/enrichment-panel';
import { OddsPanel } from '@/components/odds-panel';
import { PredictionSummary } from '@/components/prediction-summary';
import { ScreenState } from '@/components/screen-state';
import { SquadsPanel } from '@/components/squads-panel';
import { getMatchDetails } from '@/services/match-details';
import { theme } from '@/theme';

export default function MatchDetailsScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const navigation = useNavigation();
  const [details, setDetails] = useState<MatchDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDetails = useCallback(async (refresh = false) => {
    if (!matchId) {
      setError('This match link is missing an identifier.');
      setLoading(false);
      return;
    }

    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const nextDetails = await getMatchDetails(matchId);
      if (!nextDetails) {
        setError('This match is no longer available.');
        setDetails(null);
      } else {
        setDetails(nextDetails);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load match details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [matchId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    if (details) {
      navigation.setOptions({ title: `${details.match.team1} vs ${details.match.team2}` });
    }
  }, [details, navigation]);

  if (loading) {
    return <ScreenState title="Loading match" detail="Syncing prediction and match intelligence." loading />;
  }

  if (error || !details) {
    return (
      <ScreenState
        title="Match unavailable"
        detail={error ?? 'Unable to load this match.'}
        actionLabel="Try again"
        onAction={loadDetails}
      />
    );
  }

  const kickoff = new Date(details.match.date);
  const kickoffLabel = Number.isNaN(kickoff.getTime())
    ? 'Time TBD'
    : kickoff.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadDetails(true)}
          tintColor={theme.colors.accent}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.metaRow}>
          <Text style={styles.competition}>
            {details.match.competition_name || details.match.match_type}
          </Text>
          <Text style={[styles.status, details.match.status === 'live' && styles.live]}>
            {details.match.status.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.team}>{details.match.team1}</Text>
        <Text style={styles.versus}>VS</Text>
        <Text style={styles.team}>{details.match.team2}</Text>
        <Text style={styles.kickoff}>{kickoffLabel}</Text>
        <Text style={styles.venue}>{details.match.venue || details.enrichment?.venue_name || 'Venue TBD'}</Text>
      </View>

      <PredictionSummary match={details.match} prediction={details.prediction} />
      <EdgeScoreCard match={details.match} edgeScore={details.edgeScore} />
      <OddsPanel match={details.match} odds={details.odds} />
      <EnrichmentPanel enrichment={details.enrichment} />
      <SquadsPanel squads={details.squads} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  hero: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  competition: {
    color: theme.colors.accent,
    flex: 1,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  status: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  live: {
    color: theme.colors.positive,
  },
  team: {
    color: theme.colors.text,
    fontSize: 25,
    fontWeight: '900',
  },
  versus: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '800',
    marginVertical: theme.spacing.xs,
  },
  kickoff: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: theme.spacing.lg,
  },
  venue: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
});
