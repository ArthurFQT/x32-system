import QRCode from "qrcode";
import { CONFIGURED_ACCESS_BASE_URL } from "../config/constants";
import { Request } from "express";

function isLocalAccessBaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function getRequestOrigin(req: Request): string | undefined {
  const origin = req.header("origin")?.replace(/\/$/, "");
  if (origin) {
    return origin;
  }

  const referer = req.header("referer");
  if (!referer) {
    return undefined;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

export function resolveAccessBaseUrl(req?: Request): string {
  const requestOrigin = req ? getRequestOrigin(req) : undefined;

  if (
    requestOrigin &&
    (!CONFIGURED_ACCESS_BASE_URL || isLocalAccessBaseUrl(CONFIGURED_ACCESS_BASE_URL))
  ) {
    return requestOrigin;
  }

  return CONFIGURED_ACCESS_BASE_URL || "http://localhost:5173";
}

export function buildAccessUrl(tokenId: string, accessBaseUrl = resolveAccessBaseUrl()): string {
  return `${accessBaseUrl}/mix?token=${encodeURIComponent(tokenId)}`;
}

export async function buildQrCodeDataUrl(
  tokenId: string,
  accessBaseUrl = resolveAccessBaseUrl(),
): Promise<string> {
  const accessUrl = buildAccessUrl(tokenId, accessBaseUrl);
  return QRCode.toDataURL(accessUrl, {
    margin: 1,
    width: 320,
  });
}
