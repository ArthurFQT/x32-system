"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createToken = createToken;
exports.getToken = getToken;
exports.listTokens = listTokens;
exports.deleteToken = deleteToken;
exports.getTokenStatus = getTokenStatus;
exports.markRevoked = markRevoked;
exports.markExpired = markExpired;
exports.markEnabled = markEnabled;
exports.updateTokenConfig = updateTokenConfig;
exports.extendTokenExpiration = extendTokenExpiration;
exports.cleanupTokens = cleanupTokens;
const tokens = new Map();
function defaultControl() {
    return {
        volume: 0.75,
        pan: 0,
        mute: 0,
    };
}
function buildControls(channels) {
    const controls = {};
    for (const channel of channels) {
        controls[channel] = defaultControl();
    }
    return controls;
}
function buildControlsByBus(busList, channels) {
    const controlsByBus = {};
    for (const bus of busList) {
        controlsByBus[bus] = buildControls(channels);
    }
    return controlsByBus;
}
function createToken(data) {
    const record = {
        id: data.id,
        user: data.user,
        bus: data.bus,
        allowedChannels: data.allowedChannels,
        enabled: true,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
        controlsByBus: buildControlsByBus(data.bus, data.allowedChannels),
    };
    tokens.set(record.id, record);
    return record;
}
function getToken(id) {
    return tokens.get(id);
}
function listTokens() {
    return Array.from(tokens.values()).sort((a, b) => b.createdAt - a.createdAt);
}
function deleteToken(id) {
    return tokens.delete(id);
}
function getTokenStatus(token, now = Date.now()) {
    if (!token.enabled && token.blockedReason === "revoked") {
        return "revoked";
    }
    if (now > token.expiresAt || token.blockedReason === "expired") {
        return "expired";
    }
    if (!token.enabled) {
        return "revoked";
    }
    return "active";
}
function markRevoked(token, now = Date.now()) {
    token.enabled = false;
    token.blockedReason = "revoked";
    token.revokedAt = now;
}
function markExpired(token) {
    token.enabled = false;
    token.blockedReason = "expired";
}
function markEnabled(token) {
    token.enabled = true;
    token.blockedReason = undefined;
    token.revokedAt = undefined;
}
function buildUpdatedBusControls(token, nextBusList, nextChannels) {
    const controlsByBus = {};
    for (const bus of nextBusList) {
        const existingBusControls = token.controlsByBus[bus] ?? {};
        const channelControls = {};
        for (const channel of nextChannels) {
            channelControls[channel] = existingBusControls[channel] ?? defaultControl();
        }
        controlsByBus[bus] = channelControls;
    }
    return controlsByBus;
}
function updateTokenConfig(token, patch) {
    if (patch.user !== undefined) {
        token.user = patch.user;
    }
    if (patch.bus !== undefined) {
        token.bus = patch.bus;
        token.controlsByBus = buildUpdatedBusControls(token, token.bus, token.allowedChannels);
    }
    if (patch.allowedChannels !== undefined) {
        token.allowedChannels = patch.allowedChannels;
        token.controlsByBus = buildUpdatedBusControls(token, token.bus, token.allowedChannels);
    }
    return token;
}
function extendTokenExpiration(token, extraMinutes) {
    const now = Date.now();
    const base = token.expiresAt > now ? token.expiresAt : now;
    token.expiresAt = base + extraMinutes * 60 * 1000;
    return token;
}
function cleanupTokens(now, retentionMs) {
    const expired = [];
    const removed = [];
    for (const token of tokens.values()) {
        if (token.enabled && now > token.expiresAt) {
            markExpired(token);
            expired.push(token);
        }
        const referenceTs = token.revokedAt ?? token.expiresAt;
        if (!token.enabled && now - referenceTs > retentionMs) {
            tokens.delete(token.id);
            removed.push(token.id);
        }
    }
    return { expired, removed };
}
