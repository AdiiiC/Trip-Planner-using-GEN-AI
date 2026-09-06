"""Structured logging and lightweight metrics.

Logs are emitted as one JSON object per line so a log platform can filter on
fields (`status`, `duration_ms`, `route`) instead of regex-matching prose. Set
LOG_FORMAT=text for human-readable local output.

Every record carries the request id, so a user reporting a failure with the
X-Request-ID from their response can be traced to the exact server-side lines.
"""
from __future__ import annotations

import json
import logging
import sys
import time
from collections import defaultdict
from contextvars import ContextVar
from threading import Lock
from typing import Any

# Populated by RequestContextMiddleware; bound onto records by RequestContextFilter.
request_id_var: ContextVar[str] = ContextVar("request_id", default="")
user_id_var: ContextVar[str] = ContextVar("user_id", default="")

# Attributes the stdlib puts on every LogRecord. Anything else was passed by the
# caller via `extra=` and belongs in the JSON output.
_STDLIB_ATTRS = frozenset(logging.LogRecord("", 0, "", 0, "", None, None).__dict__) | {
    "asctime", "message", "taskName",
}


def install_record_factory() -> None:
    """Stamp the current request's ids onto every LogRecord at creation.

    A record factory rather than a logging.Filter: filters attached to the root
    logger are not applied to records propagated up from child loggers, and a
    formatter reading the ContextVars runs too late -- possibly on another
    thread, or after the response is sent -- when the vars are back to their
    defaults and the correlation is silently lost.
    """
    existing = logging.getLogRecordFactory()
    if getattr(existing, "_binds_request_context", False):
        return  # configure_logging may run more than once under tests

    def factory(*args: Any, **kwargs: Any) -> logging.LogRecord:
        record = existing(*args, **kwargs)
        if rid := request_id_var.get():
            record.request_id = rid
        if uid := user_id_var.get():
            record.user_id = uid
        return record

    factory._binds_request_context = True  # type: ignore[attr-defined]
    logging.setLogRecordFactory(factory)


class JsonFormatter(logging.Formatter):
    # Emitted first, in this order, so lines are readable when eyeballed raw.
    _LEADING = ("request_id", "user_id")

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
                  + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in self._LEADING:
            if value := getattr(record, key, ""):
                payload[key] = value
        for key, value in record.__dict__.items():
            if key not in _STDLIB_ATTRS and key not in self._LEADING and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: int = logging.INFO, json_output: bool = True) -> None:
    install_record_factory()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        JsonFormatter() if json_output
        else logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
    )
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    # Uvicorn duplicates every access line the request middleware already logs.
    logging.getLogger("uvicorn.access").disabled = True


# ── metrics ───────────────────────────────────────────────────────────────────

class Metrics:
    """In-process counters and latency samples.

    Deliberately small: it exposes the three numbers that answer "is the app
    healthy?" without adding a Prometheus dependency. Because the state is
    per-process, `/metrics` reports one instance — see the scaling notes before
    relying on it with more than one worker.
    """

    _MAX_SAMPLES = 1000

    def __init__(self) -> None:
        self._lock = Lock()
        self._requests: dict[tuple[str, int], int] = defaultdict(int)
        self._latencies: dict[str, list[float]] = defaultdict(list)
        self._events: dict[str, int] = defaultdict(int)

    def record_request(self, route: str, status: int, duration_ms: float) -> None:
        with self._lock:
            self._requests[(route, status)] += 1
            samples = self._latencies[route]
            samples.append(duration_ms)
            if len(samples) > self._MAX_SAMPLES:
                del samples[: len(samples) - self._MAX_SAMPLES]

    def incr(self, event: str, n: int = 1) -> None:
        """Count a domain event, e.g. llm.fallback or llm.failure."""
        with self._lock:
            self._events[event] += n

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            requests = dict(self._requests)
            latencies = {k: sorted(v) for k, v in self._latencies.items()}
            events = dict(self._events)

        total = sum(requests.values())
        errors = sum(n for (_, status), n in requests.items() if status >= 500)
        client_errors = sum(n for (_, status), n in requests.items() if 400 <= status < 500)
        return {
            "requests_total": total,
            "error_rate": round(errors / total, 4) if total else 0.0,
            "client_error_rate": round(client_errors / total, 4) if total else 0.0,
            "latency_ms": {
                route: {
                    "count": len(s),
                    "p50": _percentile(s, 0.50),
                    "p95": _percentile(s, 0.95),
                    "p99": _percentile(s, 0.99),
                }
                for route, s in sorted(latencies.items())
            },
            "events": events,
        }


def _percentile(sorted_samples: list[float], q: float) -> float:
    if not sorted_samples:
        return 0.0
    idx = min(int(q * len(sorted_samples)), len(sorted_samples) - 1)
    return round(sorted_samples[idx], 1)


metrics = Metrics()
