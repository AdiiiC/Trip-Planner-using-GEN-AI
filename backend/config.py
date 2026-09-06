"""
Centralised, typed application configuration.

All environment variables are declared here once, validated at import time,
and imported elsewhere as `from config import settings`.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Anything shorter is below the HMAC-SHA256 block size and weakens JWT signing.
MIN_JWT_SECRET_BYTES = 32
INSECURE_JWT_SECRET = "dev-insecure-change-me"  # noqa: S105 — sentinel, not a credential


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # ── LLM providers ─────────────────────────────────────────────────────────
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    primary_model: str = Field(default="openai/gpt-oss-20b", alias="PRIMARY_MODEL")
    fallback_model: str = Field(default="meta-llama/llama-3.3-70b-instruct", alias="FALLBACK_MODEL")

    # ── Search providers ──────────────────────────────────────────────────────
    serper_api_key: str = Field(default="", alias="SERPER_API_KEY")
    exa_api_key: str = Field(default="", alias="EXA_API_KEY")

    # ── Infra ─────────────────────────────────────────────────────────────────
    redis_url: str = Field(default="", alias="REDIS_URL")
    sentry_dsn: str = Field(default="", alias="SENTRY_DSN_BACKEND")
    allowed_origins: str = Field(default="", alias="ALLOWED_ORIGINS")
    rapidapi_key: str = Field(default="", alias="RAPIDAPI_KEY")
    debug: bool = Field(default=False, alias="DEBUG")
    # Set to "production" on the deployed instance; startup then hard-fails on
    # anything `insecure_settings()` reports instead of only logging it.
    environment: str = Field(default="development", alias="ENVIRONMENT")
    # "json" for machine-parseable logs in deployment, "text" for readable local ones.
    log_format: str = Field(default="json", alias="LOG_FORMAT")
    # Only enable when a reverse proxy (Render, nginx, Cloudflare) sets
    # X-Forwarded-For itself. Otherwise callers can spoof it to dodge throttling.
    trust_proxy_headers: bool = Field(default=False, alias="TRUST_PROXY_HEADERS")

    # ── Auth / accounts ───────────────────────────────────────────────────────
    database_url: str = Field(default="sqlite:///./tripplanner.db", alias="DATABASE_URL")
    jwt_secret: str = Field(default=INSECURE_JWT_SECRET, alias="JWT_SECRET")
    jwt_access_ttl: int = Field(default=60 * 60 * 24 * 7, alias="JWT_ACCESS_TTL")   # 7 days
    jwt_mfa_ttl: int = Field(default=300, alias="JWT_MFA_TTL")                       # 5 min
    totp_issuer: str = Field(default="Wayfare", alias="TOTP_ISSUER")
    # Handle backfilled onto the owner's pre-existing test account on startup.
    # Pin it to one address with SEED_USERNAME_EMAIL; blank SEED_USERNAME disables it.
    seed_username: str = Field(default="Aadhi_123", alias="SEED_USERNAME")
    seed_username_email: str = Field(default="", alias="SEED_USERNAME_EMAIL")

    # ── Outgoing email ────────────────────────────────────────────────────────
    # Password-reset and verification links only. Leave SMTP_HOST blank to run
    # without a mail server: links are then logged instead (DEBUG only).
    smtp_host: str = Field(default="", alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")     # 587 STARTTLS, 465 implicit TLS
    smtp_user: str = Field(default="", alias="SMTP_USER")
    smtp_password: str = Field(default="", alias="SMTP_PASSWORD")
    smtp_from: str = Field(default="", alias="SMTP_FROM")
    # Public origin of the frontend — the base of every emailed link.
    app_base_url: str = Field(default="http://localhost:3000", alias="APP_BASE_URL")

    # ── Tunables ──────────────────────────────────────────────────────────────
    llm_cache_ttl: int = Field(default=900, alias="LLM_CACHE_TTL")          # 15 min
    rate_limit: str = Field(default="60/minute", alias="RATE_LIMIT")
    max_body_bytes: int = Field(default=1_048_576, alias="MAX_BODY_BYTES")  # 1 MB

    @property
    def has_groq(self) -> bool:
        return bool(self.groq_api_key)

    @property
    def has_fallback(self) -> bool:
        return bool(self.openrouter_api_key)

    @property
    def has_smtp(self) -> bool:
        return bool(self.smtp_host)

    @property
    def mail_from(self) -> str:
        """Envelope sender. Falls back to the login user so SMTP_FROM is optional."""
        return self.smtp_from or self.smtp_user

    @property
    def cors_origins(self) -> list[str]:
        base = ["http://localhost:3000", "http://127.0.0.1:3000"]
        extra = [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
        return base + extra

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod"}

    def insecure_settings(self) -> list[str]:
        """Settings that are fine on a laptop but must never reach production."""
        problems: list[str] = []
        if self.jwt_secret == INSECURE_JWT_SECRET:
            problems.append(
                "JWT_SECRET is still the built-in development value, so anyone who has read "
                "the source can mint a valid token for any account. Generate one with: "
                "python -c 'import secrets; print(secrets.token_urlsafe(48))'"
            )
        elif len(self.jwt_secret.encode()) < MIN_JWT_SECRET_BYTES:
            problems.append(
                f"JWT_SECRET is {len(self.jwt_secret.encode())} bytes; HS256 needs "
                f"at least {MIN_JWT_SECRET_BYTES}."
            )
        if self.debug:
            problems.append("DEBUG is on, which returns raw exception text to callers.")
        return problems

    def assert_production_ready(self) -> None:
        """Refuse to serve traffic with a forgeable token signing key."""
        problems = self.insecure_settings()
        if problems:
            raise RuntimeError(
                "Refusing to start with ENVIRONMENT=production:\n  - " + "\n  - ".join(problems)
            )

    def single_instance_constraints(self) -> list[str]:
        """Config that confines the app to exactly one process.

        These are not errors. They are correct and convenient for local work.
        They only bite the moment a second replica starts, and the failures are
        quiet ones -- a rate limit that allows double, a share that 404s on
        refresh -- so they are worth stating out loud at boot.
        """
        problems: list[str] = []
        if self.database_url.startswith("sqlite"):
            problems.append(
                "DATABASE_URL is SQLite, a single file with one writer. A second "
                "instance either cannot see the data or deadlocks on 'database is "
                "locked'. Use Postgres to run more than one instance."
            )
        if not self.redis_url:
            problems.append(
                "REDIS_URL is unset, so the rate limiter, the search cache and share "
                "links all live in this process's memory. Across N instances a caller "
                "gets N times the rate limit, the cache hit rate drops, and a share "
                "created on one instance 404s on another."
            )
        return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
