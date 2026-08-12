-- Preserve pre-match prediction cadence even when the deterministic core is unchanged.
-- Identical reruns should still append a timeline point, but they must not invent move attribution.

CREATE OR REPLACE FUNCTION append_prediction_snapshot(
    candidate_match_id TEXT,
    candidate_team1 TEXT,
    candidate_team2 TEXT,
    candidate_predicted_winner TEXT,
    candidate_team1_win_probability DECIMAL,
    candidate_team2_win_probability DECIMAL,
    candidate_confidence TEXT,
    candidate_edge_score JSONB,
    candidate_model TEXT,
    candidate_ensemble_size INTEGER,
    candidate_input_state JSONB,
    candidate_change_events JSONB
)
RETURNS BOOLEAN
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    latest prediction_snapshots%ROWTYPE;
    probability_delta DECIMAL;
    attributed_events JSONB;
    core_changed BOOLEAN;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(candidate_match_id));

    IF NOT EXISTS (
        SELECT 1
        FROM matches fixture
        WHERE fixture.match_id::TEXT = candidate_match_id
          AND fixture.status = 'upcoming'
          AND fixture.date::TIMESTAMPTZ > clock_timestamp()
    ) THEN
        RETURN FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM predictions current_prediction
        WHERE current_prediction.match_id::TEXT = candidate_match_id
          AND current_prediction.team1 IS NOT DISTINCT FROM candidate_team1
          AND current_prediction.team2 IS NOT DISTINCT FROM candidate_team2
          AND current_prediction.predicted_winner IS NOT DISTINCT FROM candidate_predicted_winner
          AND current_prediction.team1_win_probability::DECIMAL
              IS NOT DISTINCT FROM candidate_team1_win_probability
          AND current_prediction.team2_win_probability::DECIMAL
              IS NOT DISTINCT FROM candidate_team2_win_probability
          AND current_prediction.confidence IS NOT DISTINCT FROM candidate_confidence
          AND current_prediction.model IS NOT DISTINCT FROM candidate_model
          AND current_prediction.ensemble_size IS NOT DISTINCT FROM candidate_ensemble_size
    ) THEN
        RAISE EXCEPTION 'prediction snapshot must match the latest prediction';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM match_edge_scores authoritative_edge
        WHERE authoritative_edge.match_id::TEXT = candidate_match_id
          AND jsonb_build_object(
              'team1_score', authoritative_edge.team1_score,
              'team2_score', authoritative_edge.team2_score,
              'net_edge', authoritative_edge.net_edge,
              'edge_team', authoritative_edge.edge_team,
              'narrative', authoritative_edge.narrative,
              'factors', authoritative_edge.factors
          ) IS NOT DISTINCT FROM candidate_edge_score
    ) THEN
        RAISE EXCEPTION 'prediction snapshot must match the authoritative edge score';
    END IF;

    SELECT *
    INTO latest
    FROM prediction_snapshots
    WHERE match_id = candidate_match_id
    ORDER BY captured_at DESC, id DESC
    LIMIT 1;

    core_changed := latest.id IS NULL
        OR latest.predicted_winner IS DISTINCT FROM candidate_predicted_winner
        OR latest.team1_win_probability IS DISTINCT FROM candidate_team1_win_probability
        OR latest.team2_win_probability IS DISTINCT FROM candidate_team2_win_probability
        OR latest.confidence IS DISTINCT FROM candidate_confidence
        OR latest.edge_score IS DISTINCT FROM candidate_edge_score;

    probability_delta := CASE
        WHEN latest.id IS NULL THEN NULL
        ELSE candidate_team1_win_probability - latest.team1_win_probability
    END;

    IF core_changed THEN
        SELECT COALESCE(
            jsonb_agg(
                event || jsonb_build_object('probability_delta', probability_delta)
            ),
            '[]'::JSONB
        )
        INTO attributed_events
        FROM jsonb_array_elements(COALESCE(candidate_change_events, '[]'::JSONB)) event;
    ELSE
        attributed_events := '[]'::JSONB;
    END IF;

    INSERT INTO prediction_snapshots (
        match_id,
        team1,
        team2,
        predicted_winner,
        team1_win_probability,
        team2_win_probability,
        confidence,
        edge_score,
        model,
        ensemble_size,
        input_state,
        change_events
    ) VALUES (
        candidate_match_id,
        candidate_team1,
        candidate_team2,
        candidate_predicted_winner,
        candidate_team1_win_probability,
        candidate_team2_win_probability,
        candidate_confidence,
        candidate_edge_score,
        candidate_model,
        candidate_ensemble_size,
        COALESCE(candidate_input_state, '{}'::JSONB),
        attributed_events
    );

    RETURN TRUE;
END;
$$;
