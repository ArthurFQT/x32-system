export const PORT = parseInt(process.env.PORT ?? "3000", 10);
export const HOST = process.env.HOST ?? "0.0.0.0";
export const CONFIGURED_ACCESS_BASE_URL = (
  process.env.ACCESS_BASE_URL ?? ""
).replace(/\/$/, "");
export const BRIDGE_SECRET = process.env.BRIDGE_SECRET ?? "";
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";
export const USE_REAL_X32_IO =
  (process.env.USE_REAL_X32_IO ?? "false").toLowerCase() === "true";
export const BRIDGE_IO_REQUEST_TIMEOUT_MS = parseInt(
  process.env.BRIDGE_IO_REQUEST_TIMEOUT_MS ?? "10000",
  10,
);
export const BRIDGE_CONTROL_STATE_TIMEOUT_MS = parseInt(
  process.env.BRIDGE_CONTROL_STATE_TIMEOUT_MS ?? "15000",
  10,
);
export const CLEANUP_INTERVAL_MS = parseInt(
  process.env.CLEANUP_INTERVAL_MS ?? "10000",
  10,
);
export const TOKEN_RETENTION_MINUTES = parseInt(
  process.env.TOKEN_RETENTION_MINUTES ?? "1440",
  10,
);
export const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

export const BRIDGE_ROOM = "bridges";
export const tokenRoom = (token: string): string => `token:${token}`;

export const CHANNEL_MIN = 1;
export const CHANNEL_MAX = 32;
export const BUS_MIN = 1;
export const BUS_MAX = 16;
export const DURATION_MIN = 1;
export const DURATION_MAX = 24 * 60;
export const EXTEND_MAX = 7 * 24 * 60;
