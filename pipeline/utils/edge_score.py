"""SixSense Edge Score™ — Proprietary match edge calculator.

Computes a weighted blend of Form, Momentum, Pressure, and Market signals
to produce a per-team edge score (0–100) and a net differential.

Factors:
  1. FORM (30%)      — Win rate in recent matches, weighted recency
  2. MOMENTUM (25%)  — Win streak, margin quality from ESPN H2H results
  3. PRESSURE (25%)  — Series context, must-win scenarios, stakes
  4. MARKET (20%)    — Sportsbook implied probability (wisdom of crowds)

Usage:
    score = compute_edge_score(match, team1_form, team2_form, h2h, espn_ctx, odds)
"""

import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# --- Weight configuration ---
WEIGHT_FORM = 0.30
WEIGHT_MOMENTUM = 0.25
WEIGHT_PRESSURE = 0.25
WEIGHT_MARKET = 0.20


def _form_score(form: dict) -> float:
    """Score 0–100 based on recent win rate with recency weighting.

    Recent results matter more: last 3 matches count 2x.
    """
    win_rate = form.get("win_rate", 0.5)
    form_sequence = form.get("form_last_10", [])

    if not form_sequence:
        return win_rate * 100

    # Recency-weighted: last 3 results get double weight
    weights = []
    for i, result in enumerate(form_sequence):
        w = 2.0 if i >= len(form_sequence) - 3 else 1.0
        weights.append((1.0 if result == "W" else 0.0, w))

    weighted_sum = sum(v * w for v, w in weights)
    total_weight = sum(w for _, w in weights)
    weighted_rate = weighted_sum / total_weight if total_weight > 0 else 0.5

    return round(weighted_rate * 100, 1)


def _momentum_score(form: dict, espn_h2h: List[dict], team_name: str) -> float:
    """Score 0–100 based on winning streak and margin quality.

    - Current win streak adds up to 30 points
    - Recent H2H margin quality adds up to 70 points
    """
    form_sequence = form.get("form_last_10", [])

    # Win streak (from most recent backwards)
    streak = 0
    for result in reversed(form_sequence):
        if result == "W":
            streak += 1
        else:
            break
    # Cap at 5 for max 30 pts
    streak_score = min(streak, 5) * 6  # 0–30

    # Margin quality from ESPN H2H (did they win convincingly?)
    if not espn_h2h:
        return streak_score + 35  # neutral 35/70 for margin

    margin_pts = []
    for game in espn_h2h[:5]:  # last 5 H2H games
        winner = game.get("winner", "")
        status = game.get("status", "")
        if not winner:
            continue

        is_our_win = _fuzzy_match(winner, team_name)
        # Parse margin from status like "India won by 7 wickets"
        margin_quality = _parse_margin_quality(status, is_our_win)
        margin_pts.append(margin_quality)

    if margin_pts:
        avg_margin = sum(margin_pts) / len(margin_pts)
        margin_score = avg_margin * 70  # scale to 0–70
    else:
        margin_score = 35  # neutral

    return round(min(streak_score + margin_score, 100), 1)


def _parse_margin_quality(status: str, is_our_win: bool) -> float:
    """Parse ESPN status string to determine margin quality (0–1).

    Dominant wins = high score, narrow wins = moderate, losses = low.
    """
    if not status:
        return 0.5

    status_lower = status.lower()

    if is_our_win:
        # Check for dominant win
        runs_match = re.search(r"(\d+)\s*runs?", status_lower)
        wickets_match = re.search(r"(\d+)\s*wickets?", status_lower)

        if runs_match:
            runs = int(runs_match.group(1))
            if runs >= 100:
                return 0.95  # dominant
            elif runs >= 50:
                return 0.80
            elif runs >= 20:
                return 0.70
            else:
                return 0.60  # scrappy win
        elif wickets_match:
            wickets = int(wickets_match.group(1))
            if wickets >= 7:
                return 0.90
            elif wickets >= 5:
                return 0.75
            else:
                return 0.60
        return 0.65  # won but unknown margin
    else:
        # Loss — inverse
        runs_match = re.search(r"(\d+)\s*runs?", status_lower)
        wickets_match = re.search(r"(\d+)\s*wickets?", status_lower)

        if runs_match:
            runs = int(runs_match.group(1))
            if runs >= 100:
                return 0.05
            elif runs >= 50:
                return 0.15
            elif runs >= 20:
                return 0.30
            else:
                return 0.40
        elif wickets_match:
            wickets = int(wickets_match.group(1))
            if wickets >= 7:
                return 0.10
            elif wickets >= 5:
                return 0.25
            else:
                return 0.40
        return 0.35  # lost but unknown margin


def _pressure_score(
    series_scoreline: str,
    team_name: str,
    opponent_name: str,
    match_type: str,
    espn_h2h: List[dict],
) -> float:
    """Score 0–100 based on series situation and stakes.

    Factors:
      - Series position (trailing = more pressure = higher motivation score)
      - Must-win detection
      - Format importance (ODI/Test > T20)
      - Series decider bonus
    """
    base = 50.0  # neutral

    if series_scoreline:
        scoreline = series_scoreline.lower()

        # Parse "X-match series level A-B" or "team leads A-B"
        level_match = re.search(r"level\s+(\d+)-(\d+)", scoreline)
        leads_match = re.search(r"(\w[\w\s]*?)\s+leads?\s+(\d+)-(\d+)", scoreline)

        if level_match:
            # Series is level — decider potential
            a = int(level_match.group(1))
            # Check if it's a decider (e.g., "3-match series level 1-1")
            total_match = re.search(r"(\d+)-match", scoreline)
            if total_match:
                total = int(total_match.group(1))
                if a == total - a - 1:
                    # Decider! Both teams highly motivated
                    base = 75.0
                else:
                    base = 60.0  # level but not decider yet
            else:
                base = 60.0

        elif leads_match:
            leading_team = leads_match.group(1).strip()
            lead_score = int(leads_match.group(2))
            trail_score = int(leads_match.group(3))

            total_match = re.search(r"(\d+)-match", scoreline)
            total = int(total_match.group(1)) if total_match else 5

            is_leading = _fuzzy_match(leading_team, team_name)

            if is_leading:
                # Leading — can be complacent or go for the kill
                remaining = total - lead_score - trail_score
                if lead_score - trail_score >= remaining:
                    base = 55.0  # series already won, less pressure
                else:
                    base = 65.0  # leading but not sealed
            else:
                # Trailing — must-win territory = high motivation
                remaining = total - lead_score - trail_score
                deficit = lead_score - trail_score
                if deficit >= remaining:
                    base = 85.0  # must-win or series lost
                elif deficit >= remaining - 1:
                    base = 80.0  # essentially must-win
                else:
                    base = 70.0  # trailing but alive

    # Format importance bonus
    match_lower = match_type.lower()
    if "test" in match_lower:
        base = min(base + 5, 100)
    elif "odi" in match_lower:
        base = min(base + 3, 100)

    return round(base, 1)


def _market_score(odds: Optional[dict], team_key: str) -> float:
    """Score 0–100 from sportsbook implied probability.

    Decimal odds → implied prob: 1/odds * 100
    """
    if not odds:
        return 50.0  # no market data, neutral

    team_odds = odds.get(team_key, 0)
    if not team_odds or team_odds <= 0:
        return 50.0

    implied_prob = (1.0 / team_odds) * 100
    # Clamp to 5–95 range
    return round(max(5.0, min(95.0, implied_prob)), 1)


def _fuzzy_match(name1: str, name2: str) -> bool:
    """Check if two team names likely refer to the same team."""
    n1 = name1.lower().strip()
    n2 = name2.lower().strip()
    return n1 in n2 or n2 in n1


def compute_edge_score(
    team1: str,
    team2: str,
    team1_form: dict,
    team2_form: dict,
    espn_h2h: List[dict],
    series_scoreline: str,
    match_type: str,
    odds: Optional[dict] = None,
) -> Dict[str, Any]:
    """Compute the SixSense Edge Score for both teams.

    Args:
        team1, team2: Team names
        team1_form, team2_form: From cricsheet (win_rate, form_last_10, etc.)
        espn_h2h: ESPN H2H results list
        series_scoreline: e.g. "3-match series level 1-1"
        match_type: "ODI", "T20I", "Test", etc.
        odds: Dict with "team1_odds" and "team2_odds" (decimal)

    Returns:
        Dict with team scores, factor breakdowns, net edge, and narrative.
    """
    # --- Team 1 factors ---
    t1_form = _form_score(team1_form)
    t1_momentum = _momentum_score(team1_form, espn_h2h, team1)
    t1_pressure = _pressure_score(series_scoreline, team1, team2, match_type, espn_h2h)
    t1_market = _market_score(odds, "team1_odds") if odds else 50.0

    # --- Team 2 factors ---
    t2_form = _form_score(team2_form)
    t2_momentum = _momentum_score(team2_form, espn_h2h, team2)
    t2_pressure = _pressure_score(series_scoreline, team2, team1, match_type, espn_h2h)
    t2_market = _market_score(odds, "team2_odds") if odds else 50.0

    # --- Weighted composite ---
    t1_total = (
        t1_form * WEIGHT_FORM
        + t1_momentum * WEIGHT_MOMENTUM
        + t1_pressure * WEIGHT_PRESSURE
        + t1_market * WEIGHT_MARKET
    )
    t2_total = (
        t2_form * WEIGHT_FORM
        + t2_momentum * WEIGHT_MOMENTUM
        + t2_pressure * WEIGHT_PRESSURE
        + t2_market * WEIGHT_MARKET
    )

    net_edge = round(t1_total - t2_total, 1)
    edge_team = team1 if net_edge > 0 else team2

    # Generate narrative
    factors = []
    if abs(t1_form - t2_form) > 15:
        better = team1 if t1_form > t2_form else team2
        factors.append(f"{better} in superior form")
    if abs(t1_momentum - t2_momentum) > 15:
        better = team1 if t1_momentum > t2_momentum else team2
        factors.append(f"{better} has stronger momentum")
    if abs(t1_pressure - t2_pressure) > 10:
        higher = team1 if t1_pressure > t2_pressure else team2
        factors.append(f"{higher} under more pressure (higher stakes)")
    if odds and abs(t1_market - t2_market) > 10:
        favored = team1 if t1_market > t2_market else team2
        factors.append(f"markets favor {favored}")

    narrative = f"{edge_team} holds a +{abs(net_edge):.0f} edge"
    if factors:
        narrative += f" — {', '.join(factors)}"

    return {
        "team1_score": round(t1_total, 1),
        "team2_score": round(t2_total, 1),
        "net_edge": net_edge,
        "edge_team": edge_team,
        "narrative": narrative,
        "factors": {
            "team1": {
                "form": round(t1_form, 1),
                "momentum": round(t1_momentum, 1),
                "pressure": round(t1_pressure, 1),
                "market": round(t1_market, 1),
            },
            "team2": {
                "form": round(t2_form, 1),
                "momentum": round(t2_momentum, 1),
                "pressure": round(t2_pressure, 1),
                "market": round(t2_market, 1),
            },
        },
    }


def format_edge_for_prompt(edge: Dict[str, Any], team1: str, team2: str) -> str:
    """Format edge score breakdown for LLM prompt injection."""
    f1 = edge["factors"]["team1"]
    f2 = edge["factors"]["team2"]

    lines = [
        f"**SixSense Edge Score™ (proprietary blend):**",
        f"  {team1}: {edge['team1_score']:.0f}/100  |  {team2}: {edge['team2_score']:.0f}/100",
        f"  Net edge: {edge['edge_team']} +{abs(edge['net_edge']):.0f}",
        f"",
        f"  Factor breakdown ({team1} / {team2}):",
        f"    Form (30%):     {f1['form']:.0f} / {f2['form']:.0f}",
        f"    Momentum (25%): {f1['momentum']:.0f} / {f2['momentum']:.0f}",
        f"    Pressure (25%): {f1['pressure']:.0f} / {f2['pressure']:.0f}",
        f"    Market (20%):   {f1['market']:.0f} / {f2['market']:.0f}",
        f"",
        f"  Summary: {edge['narrative']}",
    ]
    return "\n".join(lines)
