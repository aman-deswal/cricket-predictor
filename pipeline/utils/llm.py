"""Shared LLM routing for OpenAI-compatible chat APIs.

Preferred configuration is policy-based rather than vendor-first:

    LLM_PROFILE=balanced
    LLM_PROFILE_MAP={"balanced":"balanced-primary","fast":"fast-primary","premium":"premium-primary"}
    LLM_ROUTE_MAP={"balanced-primary":"gpt-4o|https://example.com/v1|GITHUB_TOKEN"}
    LLM_FALLBACK_MODELS=balanced-secondary,cheap-backup

Direct override still works:

    LLM_MODEL=<model>
    LLM_BASE_URL=<base_url>
    LLM_API_KEY=<key>  # falls back to GITHUB_TOKEN when omitted
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    OpenAI,
    RateLimitError,
)

DEFAULT_BASE_URL = "https://models.github.ai/inference"
DEFAULT_MODEL = "openai/gpt-4o"
DEFAULT_PROFILE = "balanced"
DEFAULT_PROFILE_MAP = {
    "balanced": DEFAULT_MODEL,
    "fast": DEFAULT_MODEL,
    "premium": DEFAULT_MODEL,
}
RETRYABLE_STATUS_CODES = {408, 409, 410, 429, 500, 502, 503, 504}


class LLMUnavailableError(RuntimeError):
    """Raised when every configured route fails due to availability problems."""


@dataclass(frozen=True)
class LLMRoute:
    label: str
    model: str
    base_url: str
    api_key_env: str


def _normalize_name(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", value.strip().upper()).strip("_")


def _split_csv(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def _load_json_map(env_name: str) -> dict[str, Any]:
    raw = os.getenv(env_name, "").strip()
    if not raw:
        return {}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError(f"{env_name} must be a JSON object")
    return parsed


def _get_profile_spec(profile: str) -> str:
    profile_map = {**DEFAULT_PROFILE_MAP, **_load_json_map("LLM_PROFILE_MAP")}
    profile_spec = profile_map.get(profile)
    if profile_spec is None:
        profile_spec = os.getenv(f"LLM_PROFILE_{_normalize_name(profile)}", "")
    if isinstance(profile_spec, list):
        return ",".join(str(item).strip() for item in profile_spec if str(item).strip())
    if isinstance(profile_spec, str) and profile_spec.strip():
        return profile_spec.strip()
    return DEFAULT_MODEL


def _resolve_route_alias(spec: str) -> str:
    route_map = _load_json_map("LLM_ROUTE_MAP")
    alias_value = route_map.get(spec)
    if alias_value is None:
        alias_value = os.getenv(f"LLM_ROUTE_{_normalize_name(spec)}", "")
    if isinstance(alias_value, list):
        return ",".join(str(item).strip() for item in alias_value if str(item).strip())
    if isinstance(alias_value, str) and alias_value.strip():
        return alias_value.strip()
    return spec


def _resolve_route(spec: str) -> LLMRoute:
    resolved = _resolve_route_alias(spec)
    parts = [part.strip() for part in resolved.split("|")]
    default_key_env = os.getenv("LLM_API_KEY_ENV", "LLM_API_KEY")
    if len(parts) == 1:
        model = parts[0]
        base_url = os.getenv("LLM_BASE_URL", DEFAULT_BASE_URL)
        api_key_env = default_key_env
    elif len(parts) == 2:
        model, base_url = parts
        api_key_env = default_key_env
    elif len(parts) == 3:
        model, base_url, api_key_env = parts
    else:
        raise ValueError(
            "Each route must be 'model', 'model|base_url', or 'model|base_url|api_key_env'"
        )
    return LLMRoute(label=spec, model=model, base_url=base_url, api_key_env=api_key_env or default_key_env)


def _resolve_api_key(route: LLMRoute) -> str:
    for env_name in (route.api_key_env, "LLM_API_KEY", "GITHUB_TOKEN"):
        if env_name and os.getenv(env_name):
            return os.environ[env_name]
    raise KeyError(
        f"No API key found for route '{route.label}'. Set {route.api_key_env}, LLM_API_KEY, or GITHUB_TOKEN."
    )


def get_model_candidates() -> list[LLMRoute]:
    direct_model = os.getenv("LLM_MODEL", "").strip()
    if direct_model:
        primary_specs = [direct_model]
    else:
        profile = os.getenv("LLM_PROFILE", DEFAULT_PROFILE).strip() or DEFAULT_PROFILE
        primary_specs = _split_csv(_get_profile_spec(profile))
    fallback_specs = _split_csv(os.getenv("LLM_FALLBACK_MODELS", ""))
    route_specs = _dedupe(primary_specs + fallback_specs)
    return [_resolve_route(spec) for spec in route_specs]


def create_chat_completion(
    *,
    messages: list[dict[str, str]],
    temperature: float,
    response_format: dict[str, str],
) -> tuple[Any, LLMRoute]:
    attempts: list[str] = []
    last_error: Exception | None = None

    for route in get_model_candidates():
        client = OpenAI(base_url=route.base_url, api_key=_resolve_api_key(route))
        try:
            response = client.chat.completions.create(
                model=route.model,
                messages=messages,
                temperature=temperature,
                response_format=response_format,
            )
            return response, route
        except (APITimeoutError, APIConnectionError, RateLimitError) as exc:
            last_error = exc
            attempts.append(f"{route.model} ({exc.__class__.__name__})")
            continue
        except APIStatusError as exc:
            last_error = exc
            if exc.status_code in RETRYABLE_STATUS_CODES:
                attempts.append(f"{route.model} ({exc.status_code})")
                continue
            raise

    attempt_summary = ", ".join(attempts) if attempts else "no route attempts recorded"
    raise LLMUnavailableError(f"All configured LLM routes failed: {attempt_summary}") from last_error
