"""
Centralised LLM factory with an automatic fallback chain.

Every agent should call `get_llm()` instead of instantiating ChatGroq directly.
If the primary Groq model errors (rate-limit, outage), `ainvoke_with_fallback()`
transparently retries on the fallback provider (OpenRouter) when configured.
"""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import BaseMessage
from langchain_groq import ChatGroq

from config import settings

log = logging.getLogger("llm")


def get_llm(
    *,
    json_mode: bool = False,
    temperature: float = 0.3,
    timeout: int = 60,
    max_retries: int = 3,
) -> ChatGroq:
    """Return a configured primary (Groq) LLM."""
    kwargs: dict[str, Any] = {}
    if json_mode:
        kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
    return ChatGroq(
        temperature=temperature,
        model_name=settings.primary_model,
        max_retries=max_retries,
        timeout=timeout,
        api_key=settings.groq_api_key or None,
        **kwargs,
    )


def _get_fallback_llm(*, json_mode: bool, temperature: float, timeout: int):
    """OpenRouter fallback (OpenAI-compatible). Returns None if not configured."""
    if not settings.has_fallback:
        return None
    try:
        from langchain_openai import ChatOpenAI
    except ImportError:
        log.warning("langchain-openai not installed; fallback disabled")
        return None
    kwargs: dict[str, Any] = {}
    if json_mode:
        kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
    return ChatOpenAI(
        model=settings.fallback_model,
        temperature=temperature,
        timeout=timeout,
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        **kwargs,
    )


async def ainvoke_with_fallback(
    messages: list[BaseMessage],
    *,
    json_mode: bool = False,
    temperature: float = 0.3,
    timeout: int = 60,
):
    """Invoke primary LLM; on failure fall back to secondary provider."""
    primary = get_llm(json_mode=json_mode, temperature=temperature, timeout=timeout)
    try:
        return await primary.ainvoke(messages)
    except Exception as exc:  # noqa: BLE001
        log.warning("Primary LLM failed (%s); trying fallback", exc)
        fallback = _get_fallback_llm(json_mode=json_mode, temperature=temperature, timeout=timeout)
        if fallback is None:
            raise
        return await fallback.ainvoke(messages)
