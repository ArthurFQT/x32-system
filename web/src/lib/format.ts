import { LogEntry } from "@/types/app";

export function busToString(bus: number | number[]): string {
  return Array.isArray(bus) ? bus.join(",") : String(bus);
}

export function formatDateTime(ts: number | null): string {
  if (!ts) {
    return "-";
  }

  return new Date(ts).toLocaleString("pt-BR");
}

export function formatTimeLeft(
  expiresAt: number | null,
  nowTs: number,
): string {
  if (!expiresAt) {
    return "-";
  }

  const diff = expiresAt - nowTs;
  if (diff <= 0) {
    return "expirado";
  }

  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function toggleSelection(values: number[], item: number): number[] {
  if (values.includes(item)) {
    return values.filter((value) => value !== item);
  }
  return [...values, item].sort((a, b) => a - b);
}

export function formatLogMessage(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString("pt-BR");

  switch (entry.action) {
    case "CONTROL_VOLUME":
      return `${time} • O usuário "${entry.user}" alterou o volume do canal ${entry.channel} no bus ${entry.bus} para ${Math.round(Number(entry.value) * 100)}%.`;

    case "CONTROL_PAN": {
      const panValue = Number(entry.value);

      let pan = "Centro";

      if (panValue < 0) {
        pan = `Esquerda ${Math.round(Math.abs(panValue) * 100)}%`;
      } else if (panValue > 0) {
        pan = `Direita ${Math.round(panValue * 100)}%`;
      }

      return `${time} • O usuário "${entry.user}" ajustou o PAN do canal ${entry.channel} para ${pan}.`;
    }

    case "CONTROL_MUTE":
      return `${time} • O usuário "${entry.user}" ${
        entry.value ? "mutou" : "desmutou"
      } o canal ${entry.channel}.`;

    case "LOGIN":
      return `${time} • O usuário "${entry.user}" entrou no sistema.`;

    case "LOGOUT":
      return `${time} • O usuário "${entry.user}" saiu do sistema.`;

    case "CONTROL_STATE_SYNCED":
      return `${time} • O estado da mesa foi sincronizado com sucesso.`;

    case "CONTROL_STATE_SYNCED":
      return `${time} • O usuário "${entry.user}" sincronizou o estado da mesa.`;

    default:
      return `${time} • ${entry.action}`;
  }
}
