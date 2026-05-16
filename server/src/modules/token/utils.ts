import { TokenRecord } from "../../types";
import { buildAccessUrl, buildQrCodeDataUrl, resolveAccessBaseUrl } from "../../shared/qrcode";
import { getTokenStatus } from "./store";
import { buildControlsByBusSnapshot } from "../../shared/io-helper";
import { Request } from "express";

export function toPublicToken(token: TokenRecord, accessBaseUrl = resolveAccessBaseUrl()) {
  const status = getTokenStatus(token);
  const controlsByBus = buildControlsByBusSnapshot(token);

  return {
    id: token.id,
    user: token.user,
    bus: token.bus.length === 1 ? token.bus[0] : token.bus,
    allowedChannels: token.allowedChannels,
    enabled: token.enabled,
    expiresAt: token.expiresAt,
    createdAt: token.createdAt,
    revokedAt: token.revokedAt ?? null,
    status,
    accessUrl: buildAccessUrl(token.id, accessBaseUrl),
    controlsByBus,
  };
}

export async function buildTokenQRCode(tokenId: string, req?: Request) {
  const accessBaseUrl = req ? resolveAccessBaseUrl(req) : resolveAccessBaseUrl();
  const accessUrl = buildAccessUrl(tokenId, accessBaseUrl);
  const qrCodeDataUrl = await buildQrCodeDataUrl(tokenId, accessBaseUrl);

  return {
    token: tokenId,
    accessUrl,
    qrCodeDataUrl,
  };
}
