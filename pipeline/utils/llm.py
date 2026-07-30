"""Shared LLM client factory.

Override any of these env vars to swap provider/model without touching code:

    LLM_BASE_URL  — OpenAI-compatible API base  (default: GitHub Models)
    LLM_MODEL     — model identifier             (default: openai/gpt-4o)
    LLM_API_KEY   — API key; falls back to GITHUB_TOKEN
"""

import os

from openai import OpenAI

DEFAULT_BASE_URL = "https://models.github.ai/inference"
DEFAULT_MODEL = "openai/gpt-4o"

LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", DEFAULT_BASE_URL)
LLM_MODEL: str = os.getenv("LLM_MODEL", DEFAULT_MODEL)


def get_llm_client() -> OpenAI:
    api_key = os.getenv("LLM_API_KEY") or os.environ["GITHUB_TOKEN"]
    return OpenAI(base_url=LLM_BASE_URL, api_key=api_key)
