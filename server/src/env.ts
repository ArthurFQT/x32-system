import dotenv from "dotenv";
import fs from "fs";
import path from "path";

export type RuntimeEnv = "dev" | "prod";

function normalizeRuntimeEnv(value: string | undefined): RuntimeEnv | undefined {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "dev" || normalized === "development") {
    return "dev";
  }

  if (normalized === "prod" || normalized === "production") {
    return "prod";
  }

  return undefined;
}

function detectDefaultRuntimeEnv(): RuntimeEnv {
  const packageRoot = path.resolve(__dirname, "..");
  const srcRoot = path.join(packageRoot, "src");

  return path.resolve(__dirname).startsWith(srcRoot) ? "dev" : "prod";
}

export function loadEnvironment(): RuntimeEnv {
  const runtimeEnv =
    normalizeRuntimeEnv(process.env.X32_ENV) ??
    normalizeRuntimeEnv(process.env.APP_ENV) ??
    normalizeRuntimeEnv(process.env.NODE_ENV) ??
    detectDefaultRuntimeEnv();

  const packageRoot = path.resolve(__dirname, "..");

  for (const filename of [`.env.${runtimeEnv}`, ".env"]) {
    const envPath = path.join(packageRoot, filename);
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: false });
    }
  }

  process.env.X32_ENV = runtimeEnv;
  return runtimeEnv;
}
