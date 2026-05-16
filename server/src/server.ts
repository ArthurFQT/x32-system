import cors from "cors";
import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";

// Config
import { loadEnvironment } from "./config/env";
import {
  PORT,
  HOST,
  CORS_ORIGIN,
  CLEANUP_INTERVAL_MS,
  TOKEN_RETENTION_MINUTES,
} from "./config/constants";

// Shared
import { logAction, listLogs } from "./shared/logger";

// Modules
import tokenRoutes from "./modules/token/routes";
import {
  setupBridgeHandlers,
  broadcastBridgeStatus,
} from "./modules/bridge/handlers";
import {
  setupMusicianAuth,
  blockTokenSession,
  connectedMusicianCount,
} from "./modules/musician/connection";
import { setupMusicianHandlers } from "./modules/musician/handlers";
import { BridgeService } from "./modules/bridge/service";
import { TokenService } from "./modules/token/service";
import { getTokenStatus } from "./modules/token/store";
import { cleanupTokens } from "./modules/token/store";

// ============================================================================
// Setup
// ============================================================================

loadEnvironment();

const allowedCorsOrigins =
  CORS_ORIGIN === "*"
    ? true
    : CORS_ORIGIN.split(",")
        .map((item) => item.trim())
        .filter(Boolean);

// ============================================================================
// Express App
// ============================================================================

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: allowedCorsOrigins,
  }),
);

// Health Check
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    ...getOverview(),
  });
});

// Admin Routes
app.get("/admin/overview", (req, res) => {
  res.json(getOverview());
});

app.get("/admin/io-options", async (req, res) => {
  const { USE_REAL_X32_IO } = await import("./config/constants");

  const forceRefresh =
    String(req.query.refresh ?? "false").toLowerCase() === "true";

  if (!USE_REAL_X32_IO) {
    res.json({
      mode: "mock",
      options: BridgeService.buildMockIoOptions(),
    });
    return;
  }

  try {
    const options = await BridgeService.requestBridgeIoOptions(
      io,
      forceRefresh,
    );
    res.json({
      mode: "real",
      options,
    });
  } catch (error) {
    res.status(503).json({
      error: error instanceof Error ? error.message : "BRIDGE_IO_FAILED",
    });
  }
});

app.get("/admin/logs", (req, res) => {
  const rawLimit = Number(req.query.limit ?? 200);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(1000, Math.floor(rawLimit)))
    : 200;

  res.json({
    logs: listLogs(limit),
  });
});

// Token Routes (includes all /generate, /revoke, /token/:id/* endpoints)
app.use("/", tokenRoutes);

// ============================================================================
// Socket.io Server
// ============================================================================

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedCorsOrigins,
  },
});

// Setup Socket.io handlers
setupBridgeHandlers(io);
setupMusicianAuth(io);
setupMusicianHandlers(io);

// ============================================================================
// Cleanup Interval
// ============================================================================

setInterval(() => {
  const now = Date.now();
  const retentionMs = TOKEN_RETENTION_MINUTES * 60 * 1000;
  const { expired } = cleanupTokens(now, retentionMs);

  for (const token of expired) {
    logAction("TOKEN_EXPIRED", {
      token: token.id,
      user: token.user,
    });
    blockTokenSession(io, token.id, "expired");
  }
}, CLEANUP_INTERVAL_MS).unref();

// ============================================================================
// Helper Functions
// ============================================================================

function getOverview() {
  const tokens = TokenService.listAllTokens();
  const now = Date.now();

  const summary = {
    total: tokens.length,
    active: 0,
    revoked: 0,
    expired: 0,
  };

  for (const token of tokens) {
    const status = getTokenStatus(token, now);
    if (status === "active") {
      summary.active += 1;
    } else if (status === "revoked") {
      summary.revoked += 1;
    } else {
      summary.expired += 1;
    }
  }

  return {
    environment: process.env.X32_ENV,
    now,
    bridgeConnected: BridgeService.isBridgeConnected(io),
    connectedMusicians: connectedMusicianCount(io),
    tokens: summary,
  };
}

// ============================================================================
// Start Server
// ============================================================================

server.listen(PORT, HOST, () => {
  console.log(`X32 server listening on ${HOST}:${PORT}`);
});
