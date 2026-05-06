"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const qrcode_1 = __importDefault(require("qrcode"));
const socket_io_1 = require("socket.io");
const uuid_1 = require("uuid");
const logger_1 = require("./logger");
const tokenStore_1 = require("./tokenStore");
const validation_1 = require("./validation");
dotenv_1.default.config();
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const ACCESS_BASE_URL = (process.env.ACCESS_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const BRIDGE_SECRET = process.env.BRIDGE_SECRET ?? "";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";
const USE_REAL_X32_IO = (process.env.USE_REAL_X32_IO ?? "false").toLowerCase() === "true";
const BRIDGE_IO_REQUEST_TIMEOUT_MS = parseInt(process.env.BRIDGE_IO_REQUEST_TIMEOUT_MS ?? "10000", 10);
const CLEANUP_INTERVAL_MS = parseInt(process.env.CLEANUP_INTERVAL_MS ?? "10000", 10);
const TOKEN_RETENTION_MINUTES = parseInt(process.env.TOKEN_RETENTION_MINUTES ?? "1440", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
const allowedCorsOrigins = CORS_ORIGIN === "*"
    ? true
    : CORS_ORIGIN.split(",")
        .map((item) => item.trim())
        .filter(Boolean);
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: allowedCorsOrigins,
}));
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: allowedCorsOrigins,
    },
});
const BRIDGE_ROOM = "bridges";
const tokenRoom = (token) => `token:${token}`;
function buildAccessUrl(tokenId) {
    return `${ACCESS_BASE_URL}/mix?token=${encodeURIComponent(tokenId)}`;
}
async function buildQrCodeDataUrl(tokenId) {
    const accessUrl = buildAccessUrl(tokenId);
    return qrcode_1.default.toDataURL(accessUrl, {
        margin: 1,
        width: 320,
    });
}
function toPublicToken(token) {
    const status = (0, tokenStore_1.getTokenStatus)(token);
    const controlsByBus = token.bus.reduce((acc, bus) => {
        const busControls = token.controlsByBus[bus] ?? {};
        acc[bus] = token.allowedChannels.map((channel) => ({
            channel,
            ...(busControls[channel] ?? { volume: 0.75, pan: 0, mute: 0 }),
        }));
        return acc;
    }, {});
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
        accessUrl: buildAccessUrl(token.id),
        controlsByBus,
    };
}
function buildMockIoOptions() {
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
function getFirstBridgeSocket() {
    const bridgeIds = io.sockets.adapter.rooms.get(BRIDGE_ROOM);
    if (!bridgeIds || bridgeIds.size === 0) {
        return null;
    }
    const firstId = bridgeIds.values().next().value;
    if (!firstId) {
        return null;
    }
    return io.sockets.sockets.get(firstId) ?? null;
}
function requestBridgeIoOptions(forceRefresh) {
    return new Promise((resolve, reject) => {
        const bridgeSocket = getFirstBridgeSocket();
        if (!bridgeSocket) {
            reject(new Error("BRIDGE_NOT_CONNECTED"));
            return;
        }
        bridgeSocket
            .timeout(BRIDGE_IO_REQUEST_TIMEOUT_MS)
            .emit("bridge:get-io-options", { forceRefresh }, (error, response) => {
            if (error) {
                reject(new Error("BRIDGE_IO_TIMEOUT"));
                return;
            }
            if (!response || response.ok !== true) {
                reject(new Error(response?.error ?? "BRIDGE_IO_FAILED"));
                return;
            }
            resolve(response.options);
        });
    });
}
function bridgeConnected() {
    const count = io.sockets.adapter.rooms.get(BRIDGE_ROOM)?.size ?? 0;
    return count > 0;
}
function connectedMusicianCount() {
    let count = 0;
    for (const socket of io.sockets.sockets.values()) {
        if (socket.data.role === "musician") {
            count += 1;
        }
    }
    return count;
}
function broadcastBridgeStatus() {
    io.emit("bridge:status", { connected: bridgeConnected() });
}
function blockTokenSession(token, reason) {
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
function markTokenAsExpired(token) {
    if (token.blockedReason === "expired") {
        return;
    }
    (0, tokenStore_1.markExpired)(token);
    (0, logger_1.logAction)("TOKEN_EXPIRED", {
        token: token.id,
        user: token.user,
    });
    blockTokenSession(token, "expired");
}
function revokeToken(token, reason = "manual") {
    if (Date.now() > token.expiresAt) {
        markTokenAsExpired(token);
        return { message: "Token ja estava expirado." };
    }
    if (!token.enabled && token.blockedReason === "revoked") {
        return { message: "Token ja estava revogado." };
    }
    (0, tokenStore_1.markRevoked)(token);
    (0, logger_1.logAction)("TOKEN_REVOKED", {
        token: token.id,
        user: token.user,
        reason,
    });
    blockTokenSession(token, "revoked");
    return { message: "Token revogado com sucesso." };
}
function validateTokenNow(tokenId) {
    const token = (0, tokenStore_1.getToken)(tokenId);
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
function normalizeValue(type, rawValue) {
    if (type === "volume") {
        return (0, validation_1.clampVolume)(rawValue);
    }
    if (type === "pan") {
        return (0, validation_1.clampPan)(rawValue);
    }
    return (0, validation_1.clampMute)(rawValue);
}
function controlActionName(type) {
    if (type === "volume") {
        return "CONTROL_VOLUME";
    }
    if (type === "pan") {
        return "CONTROL_PAN";
    }
    return "CONTROL_MUTE";
}
function buildControlAck(token, bus, channel) {
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
function handleControl(socket, type, rawPayload, callback) {
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
    try {
        const payload = (0, validation_1.parseControlPayload)(rawPayload);
        const bus = payload.bus ?? token.bus[0];
        if (!token.bus.includes(bus)) {
            callback?.({ ok: false, error: "BUS_NOT_ALLOWED" });
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
        }
        else if (type === "pan") {
            channelControl.pan = value;
        }
        else {
            channelControl.mute = value;
        }
        const event = {
            token: token.id,
            user: token.user,
            channel: payload.channel,
            bus,
            param: type,
            value,
            timestamp: Date.now(),
        };
        io.to(BRIDGE_ROOM).emit("x32", event);
        (0, logger_1.logAction)(controlActionName(type), {
            token: token.id,
            user: token.user,
            bus,
            channel: payload.channel,
            value,
        });
        callback?.(buildControlAck(token, bus, payload.channel));
    }
    catch (error) {
        callback?.({
            ok: false,
            error: error instanceof Error ? error.message : "CONTROL_VALIDATION_FAILED",
        });
    }
}
function requireAdmin(req, res, next) {
    if (!ADMIN_API_KEY) {
        next();
        return;
    }
    const adminKey = req.header("x-admin-key") ?? "";
    if (adminKey !== ADMIN_API_KEY) {
        (0, logger_1.logAction)("ADMIN_AUTH_FAILED", {
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
    const tokens = (0, tokenStore_1.listTokens)();
    const now = Date.now();
    const summary = {
        total: tokens.length,
        active: 0,
        revoked: 0,
        expired: 0,
    };
    for (const token of tokens) {
        const status = (0, tokenStore_1.getTokenStatus)(token, now);
        if (status === "active") {
            summary.active += 1;
        }
        else if (status === "revoked") {
            summary.revoked += 1;
        }
        else {
            summary.expired += 1;
        }
    }
    return {
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
    }
    catch (error) {
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
        logs: (0, logger_1.listLogs)(limit),
    });
});
app.post("/generate", requireAdmin, async (req, res) => {
    try {
        const input = (0, validation_1.parseGeneratePayload)(req.body);
        const tokenId = (0, uuid_1.v4)();
        const createdAt = Date.now();
        const expiresAt = createdAt + input.durationMinutes * 60 * 1000;
        const token = (0, tokenStore_1.createToken)({
            id: tokenId,
            user: input.user,
            bus: input.bus,
            allowedChannels: input.allowedChannels,
            createdAt,
            expiresAt,
        });
        const accessUrl = buildAccessUrl(token.id);
        const qrCodeDataUrl = await buildQrCodeDataUrl(token.id);
        (0, logger_1.logAction)("TOKEN_GENERATED", {
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
            tokenData: toPublicToken(token),
        });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : "Erro ao gerar token.",
        });
    }
});
app.post("/revoke", requireAdmin, (req, res) => {
    try {
        const { token: tokenId } = (0, validation_1.parseRevokePayload)(req.body);
        const token = (0, tokenStore_1.getToken)(tokenId);
        if (!token) {
            res.status(404).json({ error: "Token nao encontrado." });
            return;
        }
        const result = revokeToken(token, "api_revoke");
        res.status(200).json({
            message: result.message,
            tokenData: toPublicToken(token),
        });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : "Erro ao revogar token.",
        });
    }
});
app.get("/tokens", requireAdmin, (_req, res) => {
    const tokens = (0, tokenStore_1.listTokens)().map(toPublicToken);
    res.json({ tokens });
});
app.get("/token/:tokenId/qrcode", requireAdmin, async (req, res) => {
    const token = (0, tokenStore_1.getToken)(req.params.tokenId);
    if (!token) {
        res.status(404).json({ error: "Token nao encontrado." });
        return;
    }
    const qrCodeDataUrl = await buildQrCodeDataUrl(token.id);
    res.json({
        token: token.id,
        accessUrl: buildAccessUrl(token.id),
        qrCodeDataUrl,
    });
});
app.post("/token/:tokenId/revoke", requireAdmin, (req, res) => {
    const token = (0, tokenStore_1.getToken)(req.params.tokenId);
    if (!token) {
        res.status(404).json({ error: "Token nao encontrado." });
        return;
    }
    const result = revokeToken(token, "admin_panel");
    res.json({
        message: result.message,
        tokenData: toPublicToken(token),
    });
});
app.post("/token/:tokenId/enable", requireAdmin, (req, res) => {
    const token = (0, tokenStore_1.getToken)(req.params.tokenId);
    if (!token) {
        res.status(404).json({ error: "Token nao encontrado." });
        return;
    }
    if (Date.now() > token.expiresAt) {
        markTokenAsExpired(token);
        res.status(400).json({ error: "TOKEN_EXPIRED_USE_EXTEND" });
        return;
    }
    (0, tokenStore_1.markEnabled)(token);
    (0, logger_1.logAction)("TOKEN_ENABLED", {
        token: token.id,
        user: token.user,
    });
    res.json({
        message: "Token habilitado.",
        tokenData: toPublicToken(token),
    });
});
app.post("/token/:tokenId/extend", requireAdmin, (req, res) => {
    try {
        const token = (0, tokenStore_1.getToken)(req.params.tokenId);
        if (!token) {
            res.status(404).json({ error: "Token nao encontrado." });
            return;
        }
        const { minutes } = (0, validation_1.parseExtendPayload)(req.body);
        (0, tokenStore_1.extendTokenExpiration)(token, minutes);
        if (token.blockedReason === "expired" && token.expiresAt > Date.now()) {
            (0, tokenStore_1.markEnabled)(token);
        }
        (0, logger_1.logAction)("TOKEN_EXTENDED", {
            token: token.id,
            user: token.user,
            minutes,
            newExpiresAt: token.expiresAt,
        });
        res.json({
            message: "Token estendido com sucesso.",
            tokenData: toPublicToken(token),
        });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : "Erro ao estender token.",
        });
    }
});
app.patch("/token/:tokenId", requireAdmin, (req, res) => {
    try {
        const token = (0, tokenStore_1.getToken)(req.params.tokenId);
        if (!token) {
            res.status(404).json({ error: "Token nao encontrado." });
            return;
        }
        const update = (0, validation_1.parseUpdateTokenPayload)(req.body);
        (0, tokenStore_1.updateTokenConfig)(token, update);
        (0, logger_1.logAction)("TOKEN_UPDATED", {
            token: token.id,
            user: token.user,
            changes: Object.keys(update),
        });
        res.json({
            message: "Token atualizado.",
            tokenData: toPublicToken(token),
        });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : "Erro ao atualizar token.",
        });
    }
});
app.delete("/token/:tokenId", requireAdmin, (req, res) => {
    const token = (0, tokenStore_1.getToken)(req.params.tokenId);
    if (!token) {
        res.status(404).json({ error: "Token nao encontrado." });
        return;
    }
    blockTokenSession(token, "revoked");
    (0, tokenStore_1.deleteToken)(token.id);
    (0, logger_1.logAction)("TOKEN_DELETED", {
        token: token.id,
        user: token.user,
    });
    res.json({
        message: "Token removido.",
    });
});
io.use((socket, next) => {
    const auth = (socket.handshake.auth ?? {});
    if (auth.role === "bridge") {
        if (BRIDGE_SECRET && auth.bridgeSecret !== BRIDGE_SECRET) {
            (0, logger_1.logAction)("SOCKET_AUTH_FAILED", {
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
            (0, logger_1.logAction)("SOCKET_AUTH_FAILED", {
                role: "musician",
                reason: "TOKEN_MISSING",
                socketId: socket.id,
            });
            next(new Error("TOKEN_MISSING"));
            return;
        }
        const validation = validateTokenNow(tokenId);
        if (!validation.ok) {
            (0, logger_1.logAction)("SOCKET_AUTH_FAILED", {
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
    (0, logger_1.logAction)("SOCKET_AUTH_FAILED", {
        role: "unknown",
        reason: "ROLE_INVALID",
        socketId: socket.id,
    });
    next(new Error("ROLE_INVALID"));
});
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
    const tokenId = String(socket.data.tokenId ?? "");
    const validation = validateTokenNow(tokenId);
    if (!validation.ok) {
        socket.emit("session:blocked", { reason: validation.blockedReason ?? "revoked" });
        socket.disconnect(true);
        return;
    }
    const token = validation.token;
    socket.join(tokenRoom(token.id));
    socket.emit("session:init", {
        token: token.id,
        user: token.user,
        bus: token.bus[0],
        buses: token.bus,
        allowedChannels: token.allowedChannels,
        enabled: token.enabled,
        expiresAt: token.expiresAt,
        bridgeConnected: bridgeConnected(),
        controlsByBus: token.bus.reduce((acc, bus) => {
            const busControls = token.controlsByBus[bus] ?? {};
            acc[bus] = token.allowedChannels.map((channel) => ({
                channel,
                ...(busControls[channel] ?? { volume: 0.75, pan: 0, mute: 0 }),
            }));
            return acc;
        }, {}),
    });
    socket.on("control:volume", (payload, callback) => {
        handleControl(socket, "volume", payload, callback);
    });
    socket.on("control:pan", (payload, callback) => {
        handleControl(socket, "pan", payload, callback);
    });
    socket.on("control:mute", (payload, callback) => {
        handleControl(socket, "mute", payload, callback);
    });
});
setInterval(() => {
    const now = Date.now();
    const retentionMs = TOKEN_RETENTION_MINUTES * 60 * 1000;
    const { expired } = (0, tokenStore_1.cleanupTokens)(now, retentionMs);
    for (const token of expired) {
        (0, logger_1.logAction)("TOKEN_EXPIRED", {
            token: token.id,
            user: token.user,
        });
        blockTokenSession(token, "expired");
    }
}, CLEANUP_INTERVAL_MS).unref();
server.listen(PORT, () => {
    console.log(`X32 server listening on port ${PORT}`);
});
