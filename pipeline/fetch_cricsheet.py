"""Download Cricsheet JSON archives and build local match-level CSVs."""

import argparse
import json
import logging
import tempfile
import zipfile
from pathlib import Path

import pandas as pd
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

BASE_URL = "https://cricsheet.org/downloads"
DEFAULT_DATA_DIR = Path("data/cricsheet")
SUPPORTED_TYPES = {
    "t20s": "t20s_json.zip",
    "odis": "odis_json.zip",
    "ipl": "ipl_json.zip",
}


def download_archive(match_type: str, destination: Path) -> None:
    """Download a Cricsheet JSON zip archive."""
    archive_name = SUPPORTED_TYPES[match_type]
    url = f"{BASE_URL}/{archive_name}"
    logger.info(f"Downloading {url}...")

    response = requests.get(url, timeout=120)
    response.raise_for_status()
    destination.write_bytes(response.content)


def parse_match(match_id: str, payload: dict) -> dict:
    """Parse one Cricsheet JSON match into the app's match-level stats schema."""
    info = payload.get("info", {})
    teams = info.get("teams") or ["", ""]
    outcome = info.get("outcome", {})
    toss = info.get("toss", {})
    dates = info.get("dates") or []

    return {
        "match_id": match_id,
        "date": dates[0] if dates else "",
        "gender": info.get("gender", ""),
        "team1": teams[0] if teams else "",
        "team2": teams[1] if len(teams) > 1 else "",
        "winner": outcome.get("winner", ""),
        "venue": info.get("venue", ""),
        "toss_winner": toss.get("winner", ""),
        "toss_decision": toss.get("decision", ""),
    }


def parse_players(match_id: str, payload: dict) -> list[dict]:
    """Parse player appearances from one Cricsheet JSON match."""
    info = payload.get("info", {})
    dates = info.get("dates") or []
    players_by_team = info.get("players") or {}
    gender = info.get("gender", "")

    records = []
    for team, players in players_by_team.items():
        for player in players:
            records.append({
                "match_id": match_id,
                "date": dates[0] if dates else "",
                "gender": gender,
                "team": team,
                "player": player,
            })
    return records


def build_match_csv(match_type: str, data_dir: Path) -> int:
    """Download and convert a Cricsheet archive into a match-level CSV."""
    data_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as temp_dir:
        archive_path = Path(temp_dir) / SUPPORTED_TYPES[match_type]
        download_archive(match_type, archive_path)

        match_records = []
        player_records = []
        with zipfile.ZipFile(archive_path) as archive:
            json_files = [name for name in archive.namelist() if name.endswith(".json")]
            logger.info(f"Parsing {len(json_files)} {match_type} matches...")

            for filename in json_files:
                match_id = Path(filename).stem
                with archive.open(filename) as file_handle:
                    payload = json.load(file_handle)
                match_records.append(parse_match(match_id, payload))
                player_records.extend(parse_players(match_id, payload))

    output_path = data_dir / f"{match_type}_matches.csv"
    pd.DataFrame(match_records).sort_values("date").to_csv(output_path, index=False)
    logger.info(f"Wrote {len(match_records)} rows to {output_path}")

    player_output_path = data_dir / f"{match_type}_players.csv"
    pd.DataFrame(player_records).sort_values(["date", "match_id", "team", "player"]).to_csv(player_output_path, index=False)
    logger.info(f"Wrote {len(player_records)} rows to {player_output_path}")
    return len(match_records)


def main(match_types: list[str], data_dir: Path) -> None:
    for match_type in match_types:
        build_match_csv(match_type, data_dir)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download and convert Cricsheet data")
    parser.add_argument(
        "--types",
        nargs="+",
        default=["t20s", "odis"],
        choices=sorted(SUPPORTED_TYPES),
        help="Cricsheet archives to fetch (default: t20s odis)",
    )
    parser.add_argument(
        "--data-dir",
        default=str(DEFAULT_DATA_DIR),
        help="Output directory for generated CSVs",
    )
    args = parser.parse_args()
    main(match_types=args.types, data_dir=Path(args.data_dir))