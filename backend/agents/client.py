import asyncio

import anthropic

from backend.config import ANTHROPIC_API_KEY, MAX_CONCURRENT_AI

# Shared async client — reused across all agents
_client: anthropic.AsyncAnthropic | None = None

# Semaphore to limit concurrent AI calls
semaphore = asyncio.Semaphore(MAX_CONCURRENT_AI)


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    return _client
