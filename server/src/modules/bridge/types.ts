export type IoOption = {
  id: number;
  label: string;
};

export type IoOptionsPayload = {
  source: "mock" | "real" | "fallback";
  buses: IoOption[];
  channels: IoOption[];
  fetchedAt: number;
  error?: string;
};

export type BridgeIoOptionsResponse =
  | {
      ok: true;
      options: IoOptionsPayload;
    }
  | {
      ok: false;
      error: string;
    };

export type BridgeChannelControlState = {
  channel: number;
  volume?: number;
  pan?: number;
  mute?: 0 | 1;
};

export type BridgeControlStatePayload = {
  source: "mock" | "real" | "fallback";
  controlsByBus: Record<number, BridgeChannelControlState[]>;
  fetchedAt: number;
  error?: string;
};

export type BridgeControlStateResponse =
  | {
      ok: true;
      state: BridgeControlStatePayload;
    }
  | {
      ok: false;
      error: string;
    };
