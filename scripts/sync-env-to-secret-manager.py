#!/usr/bin/env python3
"""Synchronise les fichiers .env locaux avec Google Secret Manager (bundles dotenv)."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ENV = REPO_ROOT / "backend" / ".env"
FUNCTIONS_ENV = REPO_ROOT / "functions" / ".env"
FRONTEND_ENV = REPO_ROOT / "frontend" / ".env"

DEFAULT_PROJECT = "forma-cad-dev"
SECRET_MAP = {
    "backend": ("forma-backend-env", BACKEND_ENV),
    "functions": ("forma-functions-env", FUNCTIONS_ENV),
    "frontend": ("forma-frontend-env", FRONTEND_ENV),
}


def _project_id(explicit: str | None) -> str:
    import os

    return (explicit or os.getenv("FORMA_SECRETS_PROJECT") or DEFAULT_PROJECT).strip()


def _client(project_id: str):
    from google.cloud import secretmanager

    return secretmanager.SecretManagerServiceClient(), project_id


def _ensure_secret(client, project_id: str, secret_id: str) -> str:
    parent = f"projects/{project_id}"
    name = f"{parent}/secrets/{secret_id}"
    try:
        client.get_secret(request={"name": name})
    except Exception:
        client.create_secret(
            request={
                "parent": parent,
                "secret_id": secret_id,
                "secret": {"replication": {"automatic": {}}},
            }
        )
    return name


def push_bundle(client, project_id: str, secret_id: str, env_path: Path) -> None:
    if not env_path.is_file():
        print(f"skip {secret_id}: {env_path} introuvable", file=sys.stderr)
        return
    payload = env_path.read_text(encoding="utf-8")
    secret_name = _ensure_secret(client, project_id, secret_id)
    client.add_secret_version(
        request={"parent": secret_name, "payload": {"data": payload.encode("utf-8")}}
    )
    print(f"pushed {env_path} → projects/{project_id}/secrets/{secret_id}")


def pull_bundle(client, project_id: str, secret_id: str, env_path: Path) -> None:
    name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
    try:
        response = client.access_secret_version(request={"name": name})
    except Exception as exc:
        print(f"skip pull {secret_id}: {exc}", file=sys.stderr)
        return
    payload = response.payload.data.decode("utf-8")
    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text(payload, encoding="utf-8")
    print(f"pulled projects/{project_id}/secrets/{secret_id} → {env_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync .env bundles with Google Secret Manager.")
    parser.add_argument("--push", action="store_true", help="Upload local .env files to GSM.")
    parser.add_argument("--pull", action="store_true", help="Download GSM secrets into local .env files.")
    parser.add_argument(
        "--target",
        choices=["all", "backend", "functions", "frontend"],
        default="all",
        help="Which bundle to sync (default: all).",
    )
    parser.add_argument("--project", default=None, help=f"GCP project (default: {DEFAULT_PROJECT}).")
    args = parser.parse_args()

    if not args.push and not args.pull:
        parser.error("Specify --push and/or --pull")

    project_id = _project_id(args.project)
    client, _ = _client(project_id)

    targets = ["backend", "functions", "frontend"] if args.target == "all" else [args.target]
    for key in targets:
        secret_id, env_path = SECRET_MAP[key]
        if args.push:
            push_bundle(client, project_id, secret_id, env_path)
        if args.pull:
            pull_bundle(client, project_id, secret_id, env_path)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
