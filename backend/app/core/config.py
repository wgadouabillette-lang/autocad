"""Configuration centrale de l'application.

Toutes les valeurs sont surchargeables via variables d'environnement
(voir backend/.env.example). L'application fonctionne entierement sans
cle API : l'agent IA bascule alors sur un moteur de regles deterministe.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from dotenv import load_dotenv

from app.core.secrets import load_backend_secrets_or_raise, use_local_env_only, use_secret_manager


def _env_bool(name: str, default: bool = False) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


def _data_dir() -> Path:
    custom = os.getenv("FORMA_DATA_DIR")
    if custom:
        return Path(custom)
    if _env_bool("FORMA_DESKTOP", False):
        return Path.home() / ".forma"
    return Path(__file__).resolve().parents[2]


def _backend_env_file() -> Path:
    return Path(__file__).resolve().parents[2] / ".env"


def _env_file() -> Path:
    override = os.getenv("FORMA_ENV_FILE")
    if override:
        return Path(override)
    if _env_bool("FORMA_DESKTOP", False):
        return _data_dir() / ".env"
    return _backend_env_file()


def _has_llm_env() -> bool:
    return bool(
        (os.getenv("XAI_API_KEY") or "").strip()
        or (os.getenv("OPENAI_API_KEY") or "").strip()
        or (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    )


def _load_env() -> None:
    if use_secret_manager():
        try:
            load_backend_secrets_or_raise()
        except RuntimeError:
            raise
        except Exception as exc:
            import logging

            logging.getLogger(__name__).warning(
                "Secret Manager unavailable, falling back to local .env: %s",
                exc,
            )

    primary = _env_file()
    fallback = _backend_env_file()
    if primary.exists():
        load_dotenv(primary, override=use_local_env_only())
    if fallback.exists() and fallback.resolve() != primary.resolve():
        load_dotenv(fallback, override=False)
    if not _has_llm_env() and fallback.exists():
        load_dotenv(fallback, override=True)


def ensure_desktop_env() -> Path:
    """Prépare le dossier utilisateur bureau (secrets via Secret Manager)."""
    data = _data_dir()
    data.mkdir(parents=True, exist_ok=True)
    return data


# Charge backend/.env (dev) ou ~/.forma/.env (app bureau), avec repli dev
_load_env()


@dataclass
class Settings:
    app_name: str = "Lyte"
    version: str = "0.1.0"

    # Serveur
    host: str = field(default_factory=lambda: os.getenv("FORMA_HOST", "127.0.0.1"))
    port: int = field(default_factory=lambda: int(os.getenv("FORMA_PORT", "8000")))

    # CORS (le frontend Vite tourne sur 5173 par defaut)
    cors_origins: List[str] = field(
        default_factory=lambda: os.getenv(
            "FORMA_CORS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
    )

    # LLM (optionnel). Si aucune cle -> moteur de regles.
    llm_provider: str = field(default_factory=lambda: os.getenv("FORMA_LLM_PROVIDER", "auto"))
    llm_debug: bool = field(default_factory=lambda: _env_bool("FORMA_LLM_DEBUG", False))

    # xAI Grok (recommandé pour @Modelling + vision)
    xai_api_key: str = field(default_factory=lambda: os.getenv("XAI_API_KEY", ""))
    xai_api_base: str = field(
        default_factory=lambda: os.getenv("XAI_API_BASE", "https://api.x.ai/v1")
    )
    xai_model: str = field(default_factory=lambda: os.getenv("XAI_MODEL", "grok-4.3"))
    xai_vision_model: str = field(
        default_factory=lambda: os.getenv("XAI_VISION_MODEL", "grok-4.3")
    )
    # @Modelling : vision (phase 1) + raisonnement CAO (phase 2)
    xai_modelling_vision_model: str = field(
        default_factory=lambda: os.getenv("XAI_MODELLING_VISION_MODEL", "grok-4.3")
    )
    xai_modelling_cad_model: str = field(
        default_factory=lambda: os.getenv(
            "XAI_MODELLING_CAD_MODEL", "grok-4.20-0309-reasoning"
        )
    )

    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    openai_api_base: str = field(
        default_factory=lambda: os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
    )
    openai_model: str = field(default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    openai_auto_chat_model: str = field(
        default_factory=lambda: os.getenv("FORMA_AUTO_CHAT_MODEL", "gpt-4.1-nano")
    )

    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    anthropic_model: str = field(
        default_factory=lambda: os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")
    )

    @property
    def has_llm(self) -> bool:
        return bool(self.xai_api_key or self.openai_api_key or self.anthropic_api_key)

    # Stripe (abonnement Pro + add-on usage à la demande)
    stripe_secret_key: str = field(default_factory=lambda: os.getenv("STRIPE_SECRET_KEY", ""))
    stripe_webhook_secret: str = field(
        default_factory=lambda: os.getenv("STRIPE_WEBHOOK_SECRET", "")
    )
    stripe_pro_price_id: str = field(
        default_factory=lambda: os.getenv("STRIPE_PRO_PRICE_ID", "")
    )
    stripe_on_demand_price_id: str = field(
        default_factory=lambda: os.getenv("STRIPE_ON_DEMAND_PRICE_ID", "")
    )
    stripe_on_demand_unit_cents: int = field(
        default_factory=lambda: max(int(os.getenv("STRIPE_ON_DEMAND_UNIT_CENTS", "1")), 1)
    )
    stripe_enterprise_seat_price_id: str = field(
        default_factory=lambda: os.getenv("STRIPE_ENTERPRISE_SEAT_PRICE_ID", "")
    )
    stripe_enterprise_min_members: int = field(
        default_factory=lambda: int(os.getenv("STRIPE_ENTERPRISE_MIN_MEMBERS", "10"))
    )

    @property
    def stripe_checkout_enabled(self) -> bool:
        """Checkout Pro : clé secrète + price ID Pro (webhook non requis)."""
        return bool(self.stripe_secret_key.strip() and self.stripe_pro_price_id.strip())

    @property
    def stripe_enterprise_enabled(self) -> bool:
        return bool(
            self.stripe_secret_key.strip()
            and self.stripe_enterprise_seat_price_id.strip()
        )

    @property
    def stripe_enabled(self) -> bool:
        return self.stripe_checkout_enabled or self.stripe_enterprise_enabled

    @property
    def stripe_webhooks_enabled(self) -> bool:
        return bool(self.stripe_webhook_secret.strip())


settings = Settings()
