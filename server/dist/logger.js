"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAction = logAction;
exports.listLogs = listLogs;
const logBuffer = [];
const MAX_LOG_BUFFER = 1000;
function logAction(action, metadata) {
    const entry = {
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
function listLogs(limit = 200) {
    if (limit <= 0) {
        return [];
    }
    return logBuffer.slice(-limit).reverse();
}
