"""Fetch player headshot URLs from ESPN Cricinfo and store in Supabase.

Strategy:
1. Load the albtree/cricket-headshots CSV (cricinfo_id → image URL)
2. For each player in match_squads without an image_url:
   - Search ESPN API for cricinfo_id by player name
   - Look up headshot URL from the CSV mapping
   - Construct CDN URL: img1.hscicdn.com/image/upload/f_auto,t_h_100/lsci/...
3. Batch-update squad records in Supabase
"""

import argparse
import csv
import io
import json
import os
import time
from typing import Dict, List, Optional

import requests
from dotenv import load_dotenv

from utils.db import get_client

load_dotenv()

# ESPN search API (free, no key needed)
ESPN_SEARCH_URL = "https://site.web.api.espn.com/apis/common/v3/search"

# GitHub CSV with cricinfo_id → headshot URL mapping
HEADSHOTS_CSV_URL = "https://raw.githubusercontent.com/albtree/cricket-headshots/main/headshot_url_data_cleaned.csv"

# Generic placeholder URL to skip
GENERIC_PLACEHOLDER = "generic-headshot"
PLACEHOLDER_IMAGE_TOKENS = (
    "default-player-logo",
    "generic-headshot",
    "player-placeholder",
    "cricketdata",
    "/logo.",
)

# CDN base for serving images (faster than espncricinfo.com direct)
CDN_BASE = "https://img1.hscicdn.com/image/upload/f_auto,t_h_100/lsci"


def is_placeholder_image_url(url: str) -> bool:
    if not url:
        return True
    lowered = url.lower().strip()
    return any(token in lowered for token in PLACEHOLDER_IMAGE_TOKENS)


def load_headshot_csv() -> Dict[str, str]:
    """Download and parse the headshot CSV into a cricinfo_id → image_path mapping."""
    print("📥 Downloading headshot CSV from GitHub...")
    resp = requests.get(HEADSHOTS_CSV_URL, timeout=30)
    resp.raise_for_status()

    mapping: Dict[str, str] = {}
    reader = csv.DictReader(io.StringIO(resp.text))
    for row in reader:
        cid = row["cricinfo_id"]
        url = row.get("headshot_primary_image_url") or row.get("headshot_image_url", "")
        if GENERIC_PLACEHOLDER in url:
            continue
        # Extract the path after espncricinfo.com (e.g. /db/PICTURES/CMS/316600/316605.png)
        if "/db/PICTURES/" in url:
            path = "/db/PICTURES/" + url.split("/db/PICTURES/")[1]
            mapping[cid] = path
    print(f"  ✅ Loaded {len(mapping)} headshot URLs")
    return mapping


def search_espn_players(name: str) -> List[Dict[str, str]]:
    """Search ESPN API for cricket player candidates ordered by match quality."""
    try:
        resp = requests.get(
            ESPN_SEARCH_URL,
            params={"query": name, "limit": 5, "type": "player", "sport": "cricket"},
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        items = data.get("items", [])
        if not items:
            return []

        name_lower = name.lower().strip()
        exact_matches: List[Dict[str, str]] = []
        other_matches: List[Dict[str, str]] = []
        for item in items:
            cid = str(item.get("id", "")).strip()
            if not cid:
                continue
            headshot = item.get("headshot", {})
            headshot_url = ""
            if isinstance(headshot, dict):
                headshot_url = headshot.get("href", "")
            elif isinstance(headshot, str):
                headshot_url = headshot

            entry = {
                "id": cid,
                "display_name": item.get("displayName", ""),
                "headshot_url": headshot_url,
            }
            if entry["display_name"].lower().strip() == name_lower:
                exact_matches.append(entry)
            else:
                other_matches.append(entry)

        return exact_matches + other_matches
    except Exception:
        return []


def build_cdn_url(image_path: str) -> str:
    """Convert a relative image path to the CDN URL."""
    return f"{CDN_BASE}{image_path}"


def process_squads(force: bool = False) -> None:
    """Process all squads, resolve headshots, and update Supabase."""
    sb = get_client()

    # Load the headshot mapping
    headshot_map = load_headshot_csv()

    # Fetch all squads
    print("\n🏏 Fetching squads from Supabase...")
    result = sb.table("match_squads").select("id,match_id,team,players").execute()
    squads = result.data or []
    print(f"  Found {len(squads)} squad records")

    resolved = 0
    skipped = 0
    not_found = 0
    updated_squads = 0

    for squad in squads:
        players = squad["players"]
        if isinstance(players, str):
            players = json.loads(players)

        needs_update = False
        for player in players:
            existing_image = player.get("image_url", "")
            # Skip only if image is present and not a known placeholder (unless --force)
            if existing_image and not is_placeholder_image_url(existing_image) and not force:
                skipped += 1
                continue

            name = player.get("name", "")
            if not name:
                continue

            # Search ESPN for candidate IDs/headshots
            candidates = search_espn_players(name)
            if not candidates:
                not_found += 1
                continue

            resolved_url = ""
            for candidate in candidates:
                # Preferred: curated CSV mapping by cricinfo_id
                image_path = headshot_map.get(candidate["id"])
                if image_path:
                    resolved_url = build_cdn_url(image_path)
                    break
                # Fallback: use ESPN direct full headshot URL when available
                candidate_headshot = candidate.get("headshot_url", "")
                if candidate_headshot and not is_placeholder_image_url(candidate_headshot):
                    resolved_url = candidate_headshot
                    break

            if not resolved_url:
                not_found += 1
                continue

            player["image_url"] = resolved_url
            resolved += 1
            needs_update = True
            print(f"  ✅ {name} → {player['image_url']}")

            # Small delay to avoid rate limiting ESPN
            time.sleep(0.15)

        if needs_update:
            sb.table("match_squads").update({"players": players}).eq("id", squad["id"]).execute()
            updated_squads += 1

    print(f"\n📊 Summary:")
    print(f"  ✅ Resolved: {resolved} headshots")
    print(f"  ⏭️  Skipped (already have): {skipped}")
    print(f"  ❌ Not found: {not_found}")
    print(f"  📝 Updated {updated_squads} squad records")


def main():
    parser = argparse.ArgumentParser(description="Fetch player headshots from ESPN Cricinfo")
    parser.add_argument("--force", action="store_true", help="Re-resolve all players, even those with existing images")
    args = parser.parse_args()

    process_squads(force=args.force)


if __name__ == "__main__":
    main()
