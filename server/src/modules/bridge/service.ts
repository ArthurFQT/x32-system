import { Server, Socket } from "socket.io";
import { TokenRecord } from "../../types";
import { BRIDGE_IO_REQUEST_TIMEOUT_MS, BRIDGE_CONTROL_STATE_TIMEOUT_MS, BRIDGE_ROOM } from "../../config/constants";
import { logAction } from "../../shared/logger";
import { buildMockIoOptions } from "../../shared/io-helper";
import { 
  BridgeIoOptionsResponse, 
  BridgeControlStateResponse, 
  IoOptionsPayload, 
  BridgeControlStatePayload 
} from "./types";

export class BridgeService {
  static getFirstBridgeSocket(io: Server): Socket | null {
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

  static isBridgeConnected(io: Server): boolean {
    const count = io.sockets.adapter.rooms.get(BRIDGE_ROOM)?.size ?? 0;
    return count > 0;
  }

  static requestBridgeIoOptions(io: Server, forceRefresh: boolean): Promise<IoOptionsPayload> {
    return new Promise((resolve, reject) => {
      const bridgeSocket = this.getFirstBridgeSocket(io);
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

  static requestBridgeControlState(
    io: Server,
    token: TokenRecord,
  ): Promise<BridgeControlStatePayload> {
    return new Promise((resolve, reject) => {
      const bridgeSocket = this.getFirstBridgeSocket(io);
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

  static buildMockIoOptions(): IoOptionsPayload {
    return buildMockIoOptions();
  }
}
