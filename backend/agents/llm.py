"""
Centralised LLM factory with an automatic fallback chain.

Every agent should call `get_llm()` instead of instantiating ChatGroq directly.
If the primary Groq model errors (rate-limit, outage), `ainvoke_with_fallback()`
transparently retries on the fallback provider (OpenRouter) when configured.
"""
from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator
from typing import Any

from config import settings
from langchain_core.messages import BaseMessage
from langchain_groq import ChatGroq
from observability import metrics

log = logging.getLogger("llm")

_RETIRED_GROQ_MODELS = {
    "llama-3.3-70b-versatile": "openai/gpt-oss-20b",
}


def primary_model_name() -> str:
    """Replace known retired Groq model IDs even when an old env value remains."""
    replacement = _RETIRED_GROQ_MODELS.get(settings.primary_model)
    if replacement:
        log.warning("Groq model %s is retired; using %s", settings.primary_model, replacement)
        return replacement
    return settings.primary_model


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
    else:
        kwargs["reasoning_format"] = "parsed"
    return ChatGroq(
        temperature=temperature,
        model_name=primary_model_name(),
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
    started = time.perf_counter()
    try:
        result = await primary.ainvoke(messages)
    except Exception as exc:
        metrics.incr("llm.primary_failure")
        log.warning(
            "primary LLM failed, trying fallback",
            extra={"provider": "groq", "model": primary_model_name(),
                   "error_type": type(exc).__name__,
                   "duration_ms": round((time.perf_counter() - started) * 1000, 1)},
        )
        fallback = _get_fallback_llm(json_mode=json_mode, temperature=temperature, timeout=timeout)
        if fallback is None:
            metrics.incr("llm.unavailable")
            raise
        metrics.incr("llm.fallback_used")
        result = await fallback.ainvoke(messages)
        log.info("fallback LLM succeeded", extra={"provider": "openrouter",
                 "model": settings.fallback_model,
                 "duration_ms": round((time.perf_counter() - started) * 1000, 1)})
        return result
    metrics.incr("llm.primary_success")
    log.info(
        "llm invoke",
        extra={"provider": "groq", "model": primary_model_name(),
               "duration_ms": round((time.perf_counter() - started) * 1000, 1)},
    )
    return result


async def astream_with_fallback(
    messages: list[BaseMessage],
    *,
    temperature: float = 0.3,
    timeout: int = 60,
) -> AsyncIterator[str]:
    """Stream from Groq, switching providers when it fails before output starts."""
    primary = get_llm(temperature=temperature, timeout=timeout)
    emitted = False
    try:
        async for chunk in primary.astream(messages):
            text = chunk.content or ""
            if text:
                emitted = True
                yield str(text)
        metrics.incr("llm.primary_success")
        return
    except Exception as exc:
        metrics.incr("llm.primary_failure")
        log.warning(
            "primary LLM stream failed",
            extra={"provider": "groq", "error_type": type(exc).__name__,
                   "partial_output": emitted},
        )
        if emitted:
            # Mid-stream failure: the client already has half an itinerary, and
            # restarting on the fallback would duplicate it.
            raise

    fallback = _get_fallback_llm(
        json_mode=False,
        temperature=temperature,
        timeout=timeout,
    )
    if fallback is None:
        raise RuntimeError("No language model is currently available.")
    async for chunk in fallback.astream(messages):
        text = chunk.content or ""
        if text:
            yield str(text)
