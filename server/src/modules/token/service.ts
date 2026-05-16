import { v4 as uuidv4 } from "uuid";
import { TokenRecord } from "../../types";
import {
  createToken as createTokenRecord,
  deleteToken as deleteTokenRecord,
  extendTokenExpiration,
  getToken,
  listTokens,
  markEnabled,
  markExpired,
  markRevoked,
  updateTokenConfig as updateTokenStore,
} from "./store";
import { logAction } from "../../shared/logger";
import { BlockReason } from "../../types";

export class TokenService {
  static generateToken(input: {
    user: string;
    bus: number[];
    allowedChannels: number[];
    durationMinutes: number;
  }): TokenRecord {
    const tokenId = uuidv4();
    const createdAt = Date.now();
    const expiresAt = createdAt + input.durationMinutes * 60 * 1000;

    const token = createTokenRecord({
      id: tokenId,
      user: input.user,
      bus: input.bus,
      allowedChannels: input.allowedChannels,
      createdAt,
      expiresAt,
    });

    logAction("TOKEN_GENERATED", {
      token: token.id,
      user: token.user,
      bus: token.bus,
      allowedChannels: token.allowedChannels,
      expiresAt: token.expiresAt,
    });

    return token;
  }

  static validateTokenNow(
    tokenId: string,
  ):
    | {
        ok: true;
        token: TokenRecord;
      }
    | {
        ok: false;
        error: string;
        blockedReason?: BlockReason;
      } {
    const token = getToken(tokenId);
    if (!token) {
      return { ok: false, error: "TOKEN_NOT_FOUND" };
    }

    if (Date.now() > token.expiresAt) {
      this.markExpired(token);
      return { ok: false, error: "TOKEN_EXPIRED", blockedReason: "expired" };
    }

    if (!token.enabled && token.blockedReason === "revoked") {
      return { ok: false, error: "TOKEN_REVOKED", blockedReason: "revoked" };
    }

    if (!token.enabled && token.blockedReason === "expired") {
      return { ok: false, error: "TOKEN_EXPIRED", blockedReason: "expired" };
    }

    if (!token.enabled) {
      return { ok: false, error: "TOKEN_DISABLED" };
    }

    return { ok: true, token };
  }

  static markExpired(token: TokenRecord): void {
    if (token.blockedReason === "expired") {
      return;
    }

    markExpired(token);
    logAction("TOKEN_EXPIRED", {
      token: token.id,
      user: token.user,
    });
  }

  static revokeToken(
    token: TokenRecord,
    reason = "manual",
  ): { message: string } {
    if (Date.now() > token.expiresAt) {
      this.markExpired(token);
      return { message: "Token ja estava expirado." };
    }

    if (!token.enabled && token.blockedReason === "revoked") {
      return { message: "Token ja estava revogado." };
    }

    markRevoked(token);
    logAction("TOKEN_REVOKED", {
      token: token.id,
      user: token.user,
      reason,
    });

    return { message: "Token revogado com sucesso." };
  }

  static enableToken(token: TokenRecord): void {
    markEnabled(token);
    logAction("TOKEN_ENABLED", {
      token: token.id,
      user: token.user,
    });
  }

  static extendToken(token: TokenRecord, minutes: number): void {
    extendTokenExpiration(token, minutes);

    if (token.blockedReason === "expired" && token.expiresAt > Date.now()) {
      markEnabled(token);
    }

    logAction("TOKEN_EXTENDED", {
      token: token.id,
      user: token.user,
      minutes,
      newExpiresAt: token.expiresAt,
    });
  }

  static updateToken(token: TokenRecord, update: {
    user?: string;
    bus?: number[];
    allowedChannels?: number[];
  }): void {
    updateTokenStore(token, update);

    logAction("TOKEN_UPDATED", {
      token: token.id,
      user: token.user,
      changes: Object.keys(update),
    });
  }

  static deleteToken(tokenId: string): void {
    const token = getToken(tokenId);
    if (token) {
      deleteTokenRecord(tokenId);
      logAction("TOKEN_DELETED", {
        token: token.id,
        user: token.user,
      });
    }
  }

  static listAllTokens(): TokenRecord[] {
    return listTokens();
  }

  static getToken(tokenId: string): TokenRecord | undefined {
    return getToken(tokenId);
  }
}
