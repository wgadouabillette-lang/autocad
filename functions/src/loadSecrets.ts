import { onInit } from "firebase-functions/v2/core";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const DEFAULT_SECRET = "forma-functions-env";
let secretsLoaded = false;

function useLocalEnvOnly(): boolean {
  return ["1", "true", "yes", "on"].includes(
    (process.env.FORMA_USE_LOCAL_ENV ?? "").trim().toLowerCase(),
  );
}

function projectId(): string {
  return (
    process.env.FORMA_SECRETS_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    process.env.GCP_PROJECT ??
    process.env.FIREBASE_PROJECT_ID ??
    "forma-cad-dev"
  ).trim();
}

function secretId(): string {
  return (process.env.FORMA_FUNCTIONS_SECRET_ID ?? DEFAULT_SECRET).trim();
}

function parseDotenv(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of payload.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export async function ensureFunctionsSecretsLoaded(): Promise<void> {
  if (secretsLoaded || useLocalEnvOnly()) {
    secretsLoaded = true;
    return;
  }

  const client = new SecretManagerServiceClient();
  const name = `projects/${projectId()}/secrets/${secretId()}/versions/latest`;

  try {
    const [version] = await client.accessSecretVersion({ name });
    const raw = version.payload?.data;
    const payload =
      raw instanceof Uint8Array
        ? Buffer.from(raw).toString("utf8")
        : typeof raw === "string"
          ? raw
          : "";
    const values = parseDotenv(payload);
    for (const [key, value] of Object.entries(values)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    console.info(
      `Loaded ${Object.keys(values).length} variables from Secret Manager (${secretId()})`,
    );
  } catch (error) {
    console.warn(`Secret Manager load failed for ${secretId()}:`, error);
  }

  secretsLoaded = true;
}

onInit(async () => {
  await ensureFunctionsSecretsLoaded();
});
