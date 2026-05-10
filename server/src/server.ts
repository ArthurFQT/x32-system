import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import http from "http";
import QRCode from "qrcode";
import { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { loadEnvironment } from "./env";
import { listLogs, logAction } from "./logger";
import {
  cleanupTokens,
  createToken,
  deleteToken,
  extendTokenExpiration,
  getToken,
  getTokenStatus,
  listTokens,
  markEnabled,
  markExpired,
  markRevoked,
  updateTokenConfig,
} from "./tokenStore";
import { BlockReason, ChannelControl, ControlAck, ControlType, TokenRecord, X32Event } from "./types";
import {
  clampMute,
  clampPan,
  clampVolume,
  parseControlPayload,
  parseExtendPayload,
  parseGeneratePayload,
  parseRevokePayload,
  parseUpdateTokenPayload,
} from "./validation";

const RUNTIME_ENV = loadEnvironment();

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const CONFIGURED_ACCESS_BASE_URL = (process.env.ACCESS_BASE_URL ?? "").replace(/\/$/, "");
const BRIDGE_SECRET = process.env.BRIDGE_SECRET ?? "";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";
const USE_REAL_X32_IO = (process.env.USE_REAL_X32_IO ?? "false").toLowerCase() === "true";
const BRIDGE_IO_REQUEST_TIMEOUT_MS = parseInt(
  process.env.BRIDGE_IO_REQUEST_TIMEOUT_MS ?? "10000",
  10,
);
const BRIDGE_CONTROL_STATE_TIMEOUT_MS = parseInt(
  process.env.BRIDGE_CONTROL_STATE_TIMEOUT_MS ?? "15000",
  10,
);
const CLEANUP_INTERVAL_MS = parseInt(process.env.CLEANUP_INTERVAL_MS ?? "10000", 10);
const TOKEN_RETENTION_MINUTES = parseInt(
  process.env.TOKEN_RETENTION_MINUTES ?? "1440",
  10,
);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

const allowedCorsOrigins =
  CORS_ORIGIN === "*"
    ? true
    : CORS_ORIGIN.split(",")
        .map((item) => item.trim())
        .filter(Boolean);

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: allowedCorsOrigins,
  }),
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedCorsOrigins,
  },
});

const BRIDGE_ROOM = "bridges";
const tokenRoom = (token: string): string => `token:${token}`;

type IoOption = {
  id: number;
  label: string;
};

type IoOptionsPayload = {
  source: "mock" | "real" | "fallback";
  buses: IoOption[];
  channels: IoOption[];
  fetchedAt: number;
  error?: string;
};

type BridgeIoOptionsResponse =
  | {
      ok: true;
      options: IoOptionsPayload;
    }
  | {
      ok: false;
      error: string;
    };

type BridgeChannelControlState = {
  channel: number;
  volume?: number;
  pan?: number;
  mute?: 0 | 1;
};

type BridgeControlStatePayload = {
  source: "mock" | "real" | "fallback";
  controlsByBus: Record<number, BridgeChannelControlState[]>;
  fetchedAt: number;
  error?: string;
};

type BridgeControlStateResponse =
  | {
      ok: true;
      state: BridgeControlStatePayload;
    }
  | {
      ok: false;
      error: string;
    };

function isLocalAccessBaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function getRequestOrigin(req: Request): string | undefined {
  const origin = req.header("origin")?.replace(/\/$/, "");
  if (origin) {
    return origin;
  }

  const referer = req.header("referer");
  if (!referer) {
    return undefined;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

function resolveAccessBaseUrl(req?: Request): string {
  const requestOrigin = req ? getRequestOrigin(req) : undefined;

  if (
    requestOrigin &&
    (!CONFIGURED_ACCESS_BASE_URL || isLocalAccessBaseUrl(CONFIGURED_ACCESS_BASE_URL))
  ) {
    return requestOrigin;
  }

  return CONFIGURED_ACCESS_BASE_URL || "http://localhost:5173";
}

function buildAccessUrl(tokenId: string, accessBaseUrl = resolveAccessBaseUrl()): string {
  return `${accessBaseUrl}/mix?token=${encodeURIComponent(tokenId)}`;
}

async function buildQrCodeDataUrl(
  tokenId: string,
  accessBaseUrl = resolveAccessBaseUrl(),
): Promise<string> {
  const accessUrl = buildAccessUrl(tokenId, accessBaseUrl);
  return QRCode.toDataURL(accessUrl, {
    margin: 1,
    width: 320,
  });
}

function toPublicToken(token: TokenRecord, accessBaseUrl = resolveAccessBaseUrl()) {
  const status = getTokenStatus(token);
  const controlsByBus = buildControlsByBusSnapshot(token);

  return {
    id: token.id,
    user: token.user,
    bus: token.bus.length === 1 ? token.bus[0] : token.bus,
    allowedChannels: token.allowedChannels,
    enabled: token.enabled,
    expiresAt: token.expiresAt,
    createdAt: token.createdAt,
    revokedAt: token.revokedAt ?? null,
    status,
    accessUrl: buildAccessUrl(token.id, accessBaseUrl),
    controlsByBus,
  };
}

function buildControlsByBusSnapshot(token: TokenRecord): Record<number, ChannelControl[]> {
  return token.bus.reduce<Record<number, ChannelControl[]>>((acc, bus) => {
    const busControls = token.controlsByBus[bus] ?? {};
    acc[bus] = token.allowedChannels.map((channel) => ({
      channel,
      ...(busControls[channel] ?? { volume: 0.75, pan: 0, mute: 0 }),
    }));
    return acc;
  }, {});
}

function buildMockIoOptions(): IoOptionsPayload {
  return {
    source: "mock",
    buses: Array.from({ length: 16 }, (_, idx) => ({
      id: idx + 1,
      label: `Bus ${idx + 1}`,
    })),
    channels: Array.from({ length: 32 }, (_, idx) => ({
      id: idx + 1,
      label: `Canal ${idx + 1}`,
    })),
    fetchedAt: Date.now(),
  };
}

function getFirstBridgeSocket(): Socket | null {
  const bridgeIds = io.sockets.adapter.rooms.get(BRIDGE_ROOM);
  if (!bridgeIds || bridgeIds.size === 0) {
    return null;
  }

  const firstId = bridgeIds.values().next().value as string | undefined;
  if (!firstId) {
    return null;
  }

  return io.sockets.sockets.get(firstId) ?? null;
}

function requestBridgeIoOptions(forceRefresh: boolean): Promise<IoOptionsPayload> {
  return new Promise((resolve, reject) => {
    const bridgeSocket = getFirstBridgeSocket();
    if (!bridgeSocket) {
      reject(new Error("BRIDGE_NOT_CONNECTED"));
      return;
    }

    bridgeSocket
      .timeout(BRIDGE_IO_REQUEST_TIMEOUT_MS)
      .emit(
        "bridge:get-io-options",
        { forceRefresh },
        (error: Error | null, response: BridgeIoOptionsResponse) => {
          if (error) {
            reject(new Error("BRIDGE_IO_TIMEOUT"));
            return;
          }

          if (!response || response.ok !== true) {
            reject(new Error(response?.error ?? "BRIDGE_IO_FAILED"));
            return;
          }

          resolve(response.options);
        },
      );
  });
}

function requestBridgeControlState(token: TokenRecord): Promise<BridgeControlStatePayload> {
  return new Promise((resolve, reject) => {
    const bridgeSocket = getFirstBridgeSocket();
    if (!bridgeSocket) {
      reject(new Error("BRIDGE_NOT_CONNECTED"));
      return;
    }

    bridgeSocket
      .timeout(BRIDGE_CONTROL_STATE_TIMEOUT_MS)
      .emit(
        "bridge:get-control-state",
        {
          buses: token.bus,
          channels: token.allowedChannels,
        },
        (error: Error | null, response: BridgeControlStateResponse) => {
          if (error) {
            reject(new Error("BRIDGE_CONTROL_STATE_TIMEOUT"));
            return;
          }

          if (!response || response.ok !== true) {
            reject(new Error(response?.error ?? "BRIDGE_CONTROL_STATE_FAILED"));
            return;
          }

          resolve(response.state);
        },
      );
  });
}

function bridgeConnected(): boolean {
  const count = io.sockets.adapter.rooms.get(BRIDGE_ROOM)?.size ?? 0;
  return count > 0;
}

function connectedMusicianCount(): number {
  let count = 0;

  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.role === "musician") {
      count += 1;
    }
  }

  return count;
}

function broadcastBridgeStatus(): void {
  io.emit("bridge:status", { connected: bridgeConnected() });
}

function blockTokenSession(token: TokenRecord, reason: BlockReason): void {
  io.to(tokenRoom(token.id)).emit("session:blocked", { reason });

  const socketsInRoom = io.sockets.adapter.rooms.get(tokenRoom(token.id));
  if (!socketsInRoom) {
    return;
  }

  for (const socketId of socketsInRoom) {
    const socket = io.sockets.sockets.get(socketId);
    socket?.disconnect(true);
  }
}

function markTokenAsExpired(token: TokenRecord): void {
  if (token.blockedReason === "expired") {
    return;
  }

  markExpired(token);
  logAction("TOKEN_EXPIRED", {
    token: token.id,
    user: token.user,
  });

  blockTokenSession(token, "expired");
}

function revokeToken(token: TokenRecord, reason = "manual"): { message: string } {
  if (Date.now() > token.expiresAt) {
    markTokenAsExpired(token);
    return { message: "Token ja estava expirado." };
  }

  if (!token.enabled && token.blockedReason === "revoked") {
    return { message: "Token ja estava revogado." };
  }

  markRevoked(token);
  logAction("TOKEN_REVOKED", {
    token: token.id,
    user: token.user,
    reason,
  });

  blockTokenSession(token, "revoked");
  return { message: "Token revogado com sucesso." };
}

function validateTokenNow(tokenId: string):
  | {
      ok: true;
      token: TokenRecord;
    }
  | {
      ok: false;
      error: string;
      blockedReason?: BlockReason;
    } {
  const token = getToken(tokenId);
  if (!token) {
    return { ok: false, error: "TOKEN_NOT_FOUND" };
  }

  if (Date.now() > token.expiresAt) {
    markTokenAsExpired(token);
    return { ok: false, error: "TOKEN_EXPIRED", blockedReason: "expired" };
  }

  if (!token.enabled && token.blockedReason === "revoked") {
    return { ok: false, error: "TOKEN_REVOKED", blockedReason: "revoked" };
  }

  if (!token.enabled && token.blockedReason === "expired") {
    return { ok: false, error: "TOKEN_EXPIRED", blockedReason: "expired" };
  }

  if (!token.enabled) {
    return { ok: false, error: "TOKEN_DISABLED" };
  }

  return { ok: true, token };
}

function normalizeValue(type: ControlType, rawValue: number): number {
  if (type === "volume") {
    return clampVolume(rawValue);
  }

  if (type === "pan") {
    return clampPan(rawValue);
  }

  return clampMute(rawValue);
}

function controlActionName(type: ControlType): "CONTROL_VOLUME" | "CONTROL_PAN" | "CONTROL_MUTE" {
  if (type === "volume") {
    return "CONTROL_VOLUME";
  }

  if (type === "pan") {
    return "CONTROL_PAN";
  }

  return "CONTROL_MUTE";
}

function buildControlAck(token: TokenRecord, bus: number, channel: number): ControlAck {
  const busControls = token.controlsByBus[bus] ?? {};
  const state = busControls[channel] ?? { volume: 0.75, pan: 0, mute: 0 };

  return {
    ok: true,
    bus,
    control: {
      channel,
      volume: state.volume,
      pan: state.pan,
      mute: state.mute,
    },
  };
}

function applyBridgeControlState(token: TokenRecord, state: BridgeControlStatePayload): number {
  let updatedCount = 0;

  for (const bus of token.bus) {
    const busControls = token.controlsByBus[bus];
    const incomingControls = state.controlsByBus[bus] ?? [];
    if (!busControls || incomingControls.length === 0) {
      continue;
    }

    for (const incomingControl of incomingControls) {
      if (!token.allowedChannels.includes(incomingControl.channel)) {
        continue;
      }

      const channelControl = busControls[incomingControl.channel];
      if (!channelControl) {
        continue;
      }

      if (typeof incomingControl.volume === "number" && Number.isFinite(incomingControl.volume)) {
        channelControl.volume = clampVolume(incomingControl.volume);
        updatedCount += 1;
      }

      if (typeof incomingControl.pan === "number" && Number.isFinite(incomingControl.pan)) {
        channelControl.pan = clampPan(incomingControl.pan);
        updatedCount += 1;
      }

      if (incomingControl.mute === 0 || incomingControl.mute === 1) {
        channelControl.mute = incomingControl.mute;
        updatedCount += 1;
      }
    }
  }

  return updatedCount;
}

async function syncTokenControlsFromBridge(token: TokenRecord): Promise<void> {
  if (!bridgeConnected()) {
    return;
  }

  try {
    const state = await requestBridgeControlState(token);
    const updatedCount = applyBridgeControlState(token, state);

    logAction("CONTROL_STATE_SYNCED", {
      token: token.id,
      user: token.user,
      source: state.source,
      updatedCount,
      error: state.error,
    });
  } catch (error) {
    logAction("CONTROL_STATE_SYNC_FAILED", {
      token: token.id,
      user: token.user,
      error: error instanceof Error ? error.message : "BRIDGE_CONTROL_STATE_FAILED",
    });
  }
}

function handleControl(
  socket: Socket,
  type: ControlType,
  rawPayload: unknown,
  callback?: (ack: ControlAck) => void,
): void {
  const tokenId = String(socket.data.tokenId ?? "");
  const validation = validateTokenNow(tokenId);

  if (!validation.ok) {
    callback?.({
      ok: false,
      error: validation.error,
      blockedReason: validation.blockedReason,
    });
    socket.disconnect(true);
    return;
  }

  const token = validation.token;

  if (!bridgeConnected()) {
    callback?.({ ok: false, error: "BRIDGE_NOT_CONNECTED" });
    return;
  }

  try {
    const payload = parseControlPayload(rawPayload);

    const bus = payload.bus !== undefined ? payload.bus : token.bus[0];
    if (!token.bus.includes(bus)) {
      callback?.({ ok: false, error: "BUS_LOCKED_TO_TOKEN" });
      return;
    }

    if (!token.allowedChannels.includes(payload.channel)) {
      callback?.({ ok: false, error: "CHANNEL_NOT_ALLOWED" });
      return;
    }

    const busControls = token.controlsByBus[bus];
    if (!busControls) {
      callback?.({ ok: false, error: "BUS_STATE_NOT_FOUND" });
      return;
    }

    const value = normalizeValue(type, payload.value);
    const channelControl = busControls[payload.channel];
    if (!channelControl) {
      callback?.({ ok: false, error: "CHANNEL_STATE_NOT_FOUND" });
      return;
    }

    if (type === "volume") {
      channelControl.volume = value;
    } else if (type === "pan") {
      channelControl.pan = value;
    } else {
      channelControl.mute = value as 0 | 1;
    }

    const event: X32Event = {
      token: token.id,
      user: token.user,
      channel: payload.channel,
      bus,
      param: type,
      value,
      timestamp: Date.now(),
    };

    io.to(BRIDGE_ROOM).emit("x32", event);
    logAction(controlActionName(type), {
      token: token.id,
      user: token.user,
      bus,
      channel: payload.channel,
      value,
    });

    callback?.(buildControlAck(token, bus, payload.channel));
  } catch (error) {
    callback?.({
      ok: false,
      error: error instanceof Error ? error.message : "CONTROL_VALIDATION_FAILED",
    });
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_API_KEY) {
    next();
    return;
  }

  const adminKey = req.header("x-admin-key") ?? "";
  if (adminKey !== ADMIN_API_KEY) {
    logAction("ADMIN_AUTH_FAILED", {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    res.status(401).json({ error: "ADMIN_UNAUTHORIZED" });
    return;
  }

  next();
}

function getOverview() {
  const tokens = listTokens();
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
    environment: RUNTIME_ENV,
    now,
    bridgeConnected: bridgeConnected(),
    connectedMusicians: connectedMusicianCount(),
    tokens: summary,
  };
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    ...getOverview(),
  });
});

app.get("/admin/overview", requireAdmin, (_req, res) => {
  res.json(getOverview());
});

app.get("/admin/io-options", requireAdmin, async (req, res) => {
  const forceRefresh = String(req.query.refresh ?? "false").toLowerCase() === "true";

  if (!USE_REAL_X32_IO) {
    res.json({
      mode: "mock",
      options: buildMockIoOptions(),
    });
    return;
  }

  try {
    const options = await requestBridgeIoOptions(forceRefresh);
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

app.get("/admin/logs", requireAdmin, (req, res) => {
  const rawLimit = Number(req.query.limit ?? 200);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(1000, Math.floor(rawLimit)))
    : 200;

  res.json({
    logs: listLogs(limit),
  });
});

app.post("/generate", requireAdmin, async (req, res) => {
  try {
    const accessBaseUrl = resolveAccessBaseUrl(req);
    const input = parseGeneratePayload(req.body);
    const tokenId = uuidv4();
    const createdAt = Date.now();
    const expiresAt = createdAt + input.durationMinutes * 60 * 1000;

    const token = createToken({
      id: tokenId,
      user: input.user,
      bus: input.bus,
      allowedChannels: input.allowedChannels,
      createdAt,
      expiresAt,
    });

    const accessUrl = buildAccessUrl(token.id, accessBaseUrl);
    const qrCodeDataUrl = await buildQrCodeDataUrl(token.id, accessBaseUrl);

    logAction("TOKEN_GENERATED", {
      token: token.id,
      user: token.user,
      bus: token.bus,
      allowedChannels: token.allowedChannels,
      expiresAt: token.expiresAt,
    });

    res.status(201).json({
      token: token.id,
      accessUrl,
      qrCodeDataUrl,
      tokenData: toPublicToken(token, accessBaseUrl),
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Erro ao gerar token.",
    });
  }
});

app.post("/revoke", requireAdmin, (req, res) => {
  try {
    const accessBaseUrl = resolveAccessBaseUrl(req);
    const { token: tokenId } = parseRevokePayload(req.body);
    const token = getToken(tokenId);

    if (!token) {
      res.status(404).json({ error: "Token nao encontrado." });
      return;
    }

    const result = revokeToken(token, "api_revoke");
    res.status(200).json({
      message: result.message,
      tokenData: toPublicToken(token, accessBaseUrl),
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Erro ao revogar token.",
    });
  }
});

app.get("/tokens", requireAdmin, (req, res) => {
  const accessBaseUrl = resolveAccessBaseUrl(req);
  const tokens = listTokens().map((token) => toPublicToken(token, accessBaseUrl));
  res.json({ tokens });
});

app.get("/token/:tokenId/qrcode", requireAdmin, async (req, res) => {
  const accessBaseUrl = resolveAccessBaseUrl(req);
  const token = getToken(req.params.tokenId);
  if (!token) {
    res.status(404).json({ error: "Token nao encontrado." });
    return;
  }

  const qrCodeDataUrl = await buildQrCodeDataUrl(token.id, accessBaseUrl);
  res.json({
    token: token.id,
    accessUrl: buildAccessUrl(token.id, accessBaseUrl),
    qrCodeDataUrl,
  });
});

app.post("/token/:tokenId/revoke", requireAdmin, (req, res) => {
  const accessBaseUrl = resolveAccessBaseUrl(req);
  const token = getToken(req.params.tokenId);
  if (!token) {
    res.status(404).json({ error: "Token nao encontrado." });
    return;
  }

  const result = revokeToken(token, "admin_panel");
  res.json({
    message: result.message,
    tokenData: toPublicToken(token, accessBaseUrl),
  });
});

app.post("/token/:tokenId/enable", requireAdmin, (req, res) => {
  const accessBaseUrl = resolveAccessBaseUrl(req);
  const token = getToken(req.params.tokenId);
  if (!token) {
    res.status(404).json({ error: "Token nao encontrado." });
    return;
  }

  if (Date.now() > token.expiresAt) {
    markTokenAsExpired(token);
    res.status(400).json({ error: "TOKEN_EXPIRED_USE_EXTEND" });
    return;
  }

  markEnabled(token);
  logAction("TOKEN_ENABLED", {
    token: token.id,
    user: token.user,
  });

  res.json({
    message: "Token habilitado.",
    tokenData: toPublicToken(token, accessBaseUrl),
  });
});

app.post("/token/:tokenId/extend", requireAdmin, (req, res) => {
  try {
    const accessBaseUrl = resolveAccessBaseUrl(req);
    const token = getToken(req.params.tokenId);
    if (!token) {
      res.status(404).json({ error: "Token nao encontrado." });
      return;
    }

    const { minutes } = parseExtendPayload(req.body);
    extendTokenExpiration(token, minutes);

    if (token.blockedReason === "expired" && token.expiresAt > Date.now()) {
      markEnabled(token);
    }

    logAction("TOKEN_EXTENDED", {
      token: token.id,
      user: token.user,
      minutes,
      newExpiresAt: token.expiresAt,
    });

    res.json({
      message: "Token estendido com sucesso.",
      tokenData: toPublicToken(token, accessBaseUrl),
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Erro ao estender token.",
    });
  }
});

app.patch("/token/:tokenId", requireAdmin, (req, res) => {
  try {
    const accessBaseUrl = resolveAccessBaseUrl(req);
    const token = getToken(req.params.tokenId);
    if (!token) {
      res.status(404).json({ error: "Token nao encontrado." });
      return;
    }

    const update = parseUpdateTokenPayload(req.body);
    updateTokenConfig(token, update);

    logAction("TOKEN_UPDATED", {
      token: token.id,
      user: token.user,
      changes: Object.keys(update),
    });

    res.json({
      message: "Token atualizado.",
      tokenData: toPublicToken(token, accessBaseUrl),
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Erro ao atualizar token.",
    });
  }
});

app.delete("/token/:tokenId", requireAdmin, (req, res) => {
  const token = getToken(req.params.tokenId);
  if (!token) {
    res.status(404).json({ error: "Token nao encontrado." });
    return;
  }

  blockTokenSession(token, "revoked");
  deleteToken(token.id);

  logAction("TOKEN_DELETED", {
    token: token.id,
    user: token.user,
  });

  res.json({
    message: "Token removido.",
  });
});

io.use((socket, next) => {
  const auth = (socket.handshake.auth ?? {}) as {
    role?: string;
    token?: string;
    bridgeSecret?: string;
    bridgeName?: string;
  };

  if (auth.role === "bridge") {
    if (BRIDGE_SECRET && auth.bridgeSecret !== BRIDGE_SECRET) {
      logAction("SOCKET_AUTH_FAILED", {
        role: "bridge",
        reason: "BRIDGE_SECRET_INVALID",
        socketId: socket.id,
      });
      next(new Error("BRIDGE_SECRET_INVALID"));
      return;
    }

    socket.data.role = "bridge";
    socket.data.bridgeName = auth.bridgeName ?? "bridge-local";
    next();
    return;
  }

  if (auth.role === "musician") {
    const tokenId = typeof auth.token === "string" ? auth.token.trim() : "";
    if (!tokenId) {
      logAction("SOCKET_AUTH_FAILED", {
        role: "musician",
        reason: "TOKEN_MISSING",
        socketId: socket.id,
      });
      next(new Error("TOKEN_MISSING"));
      return;
    }

    const validation = validateTokenNow(tokenId);
    if (!validation.ok) {
      logAction("SOCKET_AUTH_FAILED", {
        role: "musician",
        reason: validation.error,
        token: tokenId,
        socketId: socket.id,
      });
      next(new Error(validation.error));
      return;
    }

    socket.data.role = "musician";
    socket.data.tokenId = tokenId;
    socket.data.user = validation.token.user;
    next();
    return;
  }

  logAction("SOCKET_AUTH_FAILED", {
    role: "unknown",
    reason: "ROLE_INVALID",
    socketId: socket.id,
  });
  next(new Error("ROLE_INVALID"));
});

async function handleMusicianConnection(socket: Socket): Promise<void> {
  const tokenId = String(socket.data.tokenId ?? "");
  let validation = validateTokenNow(tokenId);
  if (!validation.ok) {
    socket.emit("session:blocked", { reason: validation.blockedReason ?? "revoked" });
    socket.disconnect(true);
    return;
  }

  let token = validation.token;
  socket.join(tokenRoom(token.id));

  await syncTokenControlsFromBridge(token);

  if (!socket.connected) {
    return;
  }

  validation = validateTokenNow(token.id);
  if (!validation.ok) {
    socket.emit("session:blocked", { reason: validation.blockedReason ?? "revoked" });
    socket.disconnect(true);
    return;
  }

  token = validation.token;
  const sessionBus = token.bus[0];
  const controlsByBus = buildControlsByBusSnapshot(token);

  socket.emit("session:init", {
    token: token.id,
    user: token.user,
    bus: sessionBus,
    buses: token.bus,
    allowedChannels: token.allowedChannels,
    enabled: token.enabled,
    expiresAt: token.expiresAt,
    bridgeConnected: bridgeConnected(),
    controlsByBus,
  });

  socket.on("control:volume", (payload, callback?: (ack: ControlAck) => void) => {
    handleControl(socket, "volume", payload, callback);
  });

  socket.on("control:pan", (payload, callback?: (ack: ControlAck) => void) => {
    handleControl(socket, "pan", payload, callback);
  });

  socket.on("control:mute", (payload, callback?: (ack: ControlAck) => void) => {
    handleControl(socket, "mute", payload, callback);
  });
}

io.on("connection", (socket) => {
  const role = String(socket.data.role ?? "");

  if (role === "bridge") {
    socket.join(BRIDGE_ROOM);
    broadcastBridgeStatus();

    socket.on("disconnect", () => {
      broadcastBridgeStatus();
    });

    return;
  }

  void handleMusicianConnection(socket).catch((error) => {
    logAction("MUSICIAN_CONNECTION_FAILED", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    socket.emit("session:blocked", { reason: "revoked" });
    socket.disconnect(true);
  });
});

setInterval(() => {
  const now = Date.now();
  const retentionMs = TOKEN_RETENTION_MINUTES * 60 * 1000;
  const { expired } = cleanupTokens(now, retentionMs);

  for (const token of expired) {
    logAction("TOKEN_EXPIRED", {
      token: token.id,
      user: token.user,
    });
    blockTokenSession(token, "expired");
  }
}, CLEANUP_INTERVAL_MS).unref();

server.listen(PORT, HOST, () => {
  console.log(`X32 server listening on ${HOST}:${PORT}`);
});
