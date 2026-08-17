"""
Centralised, typed application configuration.

All environment variables are declared here once, validated at import time,
and imported elsewhere as `from config import settings`.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # ── LLM providers ─────────────────────────────────────────────────────────
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    primary_model: str = Field(default="llama-3.3-70b-versatile", alias="PRIMARY_MODEL")
    fallback_model: str = Field(default="meta-llama/llama-3.3-70b-instruct", alias="FALLBACK_MODEL")

    # ── Search providers ──────────────────────────────────────────────────────
    serper_api_key: str = Field(default="", alias="SERPER_API_KEY")
    exa_api_key: str = Field(default="", alias="EXA_API_KEY")

    # ── Infra ─────────────────────────────────────────────────────────────────
    redis_url: str = Field(default="", alias="REDIS_URL")
    sentry_dsn: str = Field(default="", alias="SENTRY_DSN_BACKEND")
    hcaptcha_secret: str = Field(default="", alias="HCAPTCHA_SECRET_KEY")
    allowed_origins: str = Field(default="", alias="ALLOWED_ORIGINS")
    rapidapi_key: str = Field(default="", alias="RAPIDAPI_KEY")
    debug: bool = Field(default=False, alias="DEBUG")

    # ── Auth / accounts ───────────────────────────────────────────────────────
    database_url: str = Field(default="sqlite:///./tripplanner.db", alias="DATABASE_URL")
    jwt_secret: str = Field(default="dev-insecure-change-me", alias="JWT_SECRET")
    jwt_access_ttl: int = Field(default=60 * 60 * 24 * 7, alias="JWT_ACCESS_TTL")   # 7 days
    jwt_mfa_ttl: int = Field(default=300, alias="JWT_MFA_TTL")                       # 5 min
    totp_issuer: str = Field(default="Wayfare", alias="TOTP_ISSUER")
    # Handle backfilled onto the owner's pre-existing test account on startup.
    # Pin it to one address with SEED_USERNAME_EMAIL; blank SEED_USERNAME disables it.
    seed_username: str = Field(default="Aadhi_123", alias="SEED_USERNAME")
    seed_username_email: str = Field(default="", alias="SEED_USERNAME_EMAIL")


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
    def cors_origins(self) -> list[str]:
        base = ["http://localhost:3000", "http://127.0.0.1:3000"]
        extra = [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
        return base + extra


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
