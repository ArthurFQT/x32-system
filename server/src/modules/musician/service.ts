import { Server, Socket } from "socket.io";
import { TokenRecord, ControlType } from "../../types";
import { clampVolume, clampPan, clampMute } from "../auth/validation";
import { logAction } from "../../shared/logger";
import { BridgeService } from "../bridge/service";
import { BridgeControlStatePayload } from "../bridge/types";

export class MusicianService {
  static applyBridgeControlState(
    token: TokenRecord,
    state: BridgeControlStatePayload,
  ): number {
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

        if (
          typeof incomingControl.volume === "number" &&
          Number.isFinite(incomingControl.volume)
        ) {
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

  static async syncTokenControlsFromBridge(io: Server, token: TokenRecord): Promise<void> {
    if (!BridgeService.isBridgeConnected(io)) {
      return;
    }

    try {
      const state = await BridgeService.requestBridgeControlState(io, token);
      const updatedCount = this.applyBridgeControlState(token, state);

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

  static async handleMusicianConnection(io: Server, socket: Socket): Promise<void> {
    const { TokenService } = await import("../token/service");
    const { attachControlHandlers } = await import("./handlers");
    const { tokenRoom } = await import("../../config/constants");

    const tokenId = String(socket.data.tokenId ?? "");
    let validation = TokenService.validateTokenNow(tokenId);
    if (!validation.ok) {
      socket.emit("session:blocked", { reason: validation.blockedReason ?? "revoked" });
      socket.disconnect(true);
      return;
    }

    let token = validation.token;
    socket.join(tokenRoom(token.id));

    await this.syncTokenControlsFromBridge(io, token);

    if (!socket.connected) {
      return;
    }

    validation = TokenService.validateTokenNow(token.id);
    if (!validation.ok) {
      socket.emit("session:blocked", { reason: validation.blockedReason ?? "revoked" });
      socket.disconnect(true);
      return;
    }

    token = validation.token;
    const sessionBus = token.bus[0];
    const controlsByBus = Object.fromEntries(
      token.bus.map((bus) => [
        bus,
        token.allowedChannels.map((channel) => ({
          channel,
          ...(token.controlsByBus[bus]?.[channel] ?? { volume: 0.75, pan: 0, mute: 0 }),
        })),
      ]),
    );

    socket.emit("session:init", {
      token: token.id,
      user: token.user,
      bus: sessionBus,
      buses: token.bus,
      allowedChannels: token.allowedChannels,
      enabled: token.enabled,
      expiresAt: token.expiresAt,
      bridgeConnected: BridgeService.isBridgeConnected(io),
      controlsByBus,
    });

    attachControlHandlers(io, socket);
  }
}
