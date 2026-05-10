
export function busToString(bus: number | number[]): string {
  return Array.isArray(bus) ? bus.join(",") : String(bus);
}

export function formatDateTime(ts: number | null): string {
  if (!ts) {
    return "-";
  }

  return new Date(ts).toLocaleString("pt-BR");
}

export function formatTimeLeft(expiresAt: number | null, nowTs: number): string {
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
