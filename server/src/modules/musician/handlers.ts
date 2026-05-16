import { Socket, Server } from "socket.io";
import { TokenRecord, ControlType, ControlAck, X32Event } from "../../types";
import { TokenService } from "../token/service";
import { buildControlsByBusSnapshot } from "../../shared/io-helper";
import { clampVolume, clampPan, clampMute, parseControlPayload } from "../auth/validation";
import { logAction } from "../../shared/logger";
import { MusicianService } from "./service";
import { BRIDGE_ROOM, tokenRoom } from "../../config/constants";
import { BridgeService } from "../bridge/service";

function normalizeValue(type: ControlType, rawValue: number): number {
  if (type === "volume") {
    return clampVolume(rawValue);
  }

  if (type === "pan") {
    return clampPan(rawValue);
  }

  return clampMute(rawValue);
}

function controlActionName(
  type: ControlType,
): "CONTROL_VOLUME" | "CONTROL_PAN" | "CONTROL_MUTE" {
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

function handleControl(
  io: Server,
  socket: Socket,
  type: ControlType,
  rawPayload: unknown,
  callback?: (ack: ControlAck) => void,
): void {
  const tokenId = String(socket.data.tokenId ?? "");
  const validation = TokenService.validateTokenNow(tokenId);

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

  if (!BridgeService.isBridgeConnected(io)) {
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

export function setupMusicianHandlers(io: Server) {
  io.on("connection", (socket) => {
    const role = String(socket.data.role ?? "");
    if (role !== "musician") {
      return;
    }

    void MusicianService.handleMusicianConnection(io, socket).catch((error) => {
      logAction("MUSICIAN_CONNECTION_FAILED", {
        socketId: socket.id,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
      socket.emit("session:blocked", { reason: "revoked" });
      socket.disconnect(true);
    });
  });
}

export function attachControlHandlers(io: Server, socket: Socket): void {
  socket.on("control:volume", (payload, callback?: (ack: ControlAck) => void) => {
    handleControl(io, socket, "volume", payload, callback);
  });

  socket.on("control:pan", (payload, callback?: (ack: ControlAck) => void) => {
    handleControl(io, socket, "pan", payload, callback);
  });

  socket.on("control:mute", (payload, callback?: (ack: ControlAck) => void) => {
    handleControl(io, socket, "mute", payload, callback);
  });
}
