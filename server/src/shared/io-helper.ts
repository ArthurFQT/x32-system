import { ChannelControl, TokenRecord } from "../types";
import { IoOptionsPayload } from "../modules/bridge/types";

export function buildControlsByBusSnapshot(
  token: TokenRecord,
): Record<number, ChannelControl[]> {
  return token.bus.reduce<Record<number, ChannelControl[]>>((acc, bus) => {
    const busControls = token.controlsByBus[bus] ?? {};
    acc[bus] = token.allowedChannels.map((channel) => ({
      channel,
      ...(busControls[channel] ?? { volume: 0.75, pan: 0, mute: 0 }),
    }));
    return acc;
  }, {});
}

export function buildMockIoOptions(): IoOptionsPayload {
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
