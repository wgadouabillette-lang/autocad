#!/usr/bin/env node
/**
 * Charge frontend/.env depuis Google Secret Manager (forma-frontend-env).
 * Utilisé avant `npm run dev` / `npm run build` si le secret existe.
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const frontendEnv = resolve(repoRoot, "frontend/.env");
const projectId =
  process.env.FORMA_SECRETS_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.FIREBASE_PROJECT_ID ??
  "forma-cad-dev";
const secretId = process.env.FORMA_FRONTEND_SECRET_ID ?? "forma-frontend-env";

if (["1", "true", "yes", "on"].includes((process.env.FORMA_USE_LOCAL_ENV ?? "").toLowerCase())) {
  process.exit(0);
}

async function main() {
  let SecretManagerServiceClient;
  try {
    ({ SecretManagerServiceClient } = await import("@google-cloud/secret-manager"));
  } catch {
    console.warn("[secrets] @google-cloud/secret-manager unavailable — skip frontend .env pull");
    process.exit(0);
  }

  const client = new SecretManagerServiceClient();
  const name = `projects/${projectId}/secrets/${secretId}/versions/latest`;
  try {
    const [version] = await client.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString("utf8") ?? "";
    if (!payload.trim()) {
      console.warn(`[secrets] ${secretId} is empty`);
      process.exit(0);
    }
    writeFileSync(frontendEnv, payload, "utf8");
    console.log(`[secrets] wrote ${frontendEnv} from ${secretId}`);
  } catch (error) {
    if (existsSync(frontendEnv)) {
      console.warn(`[secrets] GSM pull failed, keeping existing frontend/.env`);
      process.exit(0);
    }
    console.warn(`[secrets] GSM pull failed (${secretId}):`, error?.message ?? error);
    process.exit(0);
  }
}

main();
