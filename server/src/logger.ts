export type LogAction =
  | "TOKEN_GENERATED"
  | "TOKEN_REVOKED"
  | "TOKEN_ENABLED"
  | "TOKEN_EXTENDED"
  | "TOKEN_UPDATED"
  | "TOKEN_DELETED"
  | "TOKEN_EXPIRED"
  | "CONTROL_VOLUME"
  | "CONTROL_PAN"
  | "CONTROL_MUTE"
  | "SOCKET_AUTH_FAILED"
  | "ADMIN_AUTH_FAILED";

export type LogEntry = {
  timestamp: string;
  action: LogAction;
} & Record<string, unknown>;

const logBuffer: LogEntry[] = [];
const MAX_LOG_BUFFER = 1000;

export function logAction(
  action: LogAction,
  metadata: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    action,
    ...metadata,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_BUFFER) {
    logBuffer.splice(0, logBuffer.length - MAX_LOG_BUFFER);
  }

  console.log(JSON.stringify(entry));
}

export function listLogs(limit = 200): LogEntry[] {
  if (limit <= 0) {
    return [];
  }

  return logBuffer.slice(-limit).reverse();
}
