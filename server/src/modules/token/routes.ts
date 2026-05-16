import { Router, Request, Response, NextFunction } from "express";
import {
  parseGeneratePayload,
  parseUpdateTokenPayload,
  parseRevokePayload,
  parseExtendPayload,
} from "../auth/validation";
import { TokenService } from "./service";
import { toPublicToken, buildTokenQRCode } from "./utils";
import { resolveAccessBaseUrl } from "../../shared/qrcode";
import { ADMIN_API_KEY } from "../../config/constants";
import { logAction } from "../../shared/logger";

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_API_KEY) {
    next();
    return;
  }

  const adminKey = req.header("x-admin-key") ?? "";
  if (adminKey !== ADMIN_API_KEY) {
    logAction("ADMIN_AUTH_FAILED", {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    res.status(401).json({ error: "ADMIN_UNAUTHORIZED" });
    return;
  }

  next();
}

const router = Router();

router.post("/generate", requireAdmin, async (req, res) => {
  try {
    const input = parseGeneratePayload(req.body);
    const token = TokenService.generateToken(input);
    const qrCodeData = await buildTokenQRCode(token.id, req);

    res.status(201).json({
      token: token.id,
      accessUrl: qrCodeData.accessUrl,
      qrCodeDataUrl: qrCodeData.qrCodeDataUrl,
      tokenData: toPublicToken(token, resolveAccessBaseUrl(req)),
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Erro ao gerar token.",
    });
  }
});

router.post("/revoke", requireAdmin, (req, res) => {
  try {
    const { token: tokenId } = parseRevokePayload(req.body);
    const token = TokenService.getToken(tokenId);

    if (!token) {
      res.status(404).json({ error: "Token nao encontrado." });
      return;
    }

    const result = TokenService.revokeToken(token, "api_revoke");
    res.status(200).json({
      message: result.message,
      tokenData: toPublicToken(token, resolveAccessBaseUrl(req)),
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Erro ao revogar token.",
    });
  }
});

router.get("/tokens", requireAdmin, (req, res) => {
  const tokens = TokenService.listAllTokens().map((token) =>
    toPublicToken(token, resolveAccessBaseUrl(req)),
  );
  res.json({ tokens });
});

router.get("/token/:tokenId/qrcode", requireAdmin, async (req, res) => {
  const token = TokenService.getToken(req.params.tokenId);
  if (!token) {
    res.status(404).json({ error: "Token nao encontrado." });
    return;
  }

  try {
    const qrCodeData = await buildTokenQRCode(token.id, req);
    res.json(qrCodeData);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Erro ao gerar QR Code.",
    });
  }
});

router.post("/token/:tokenId/revoke", requireAdmin, (req, res) => {
  const token = TokenService.getToken(req.params.tokenId);
  if (!token) {
    res.status(404).json({ error: "Token nao encontrado." });
    return;
  }

  const result = TokenService.revokeToken(token, "admin_panel");
  res.json({
    message: result.message,
    tokenData: toPublicToken(token, resolveAccessBaseUrl(req)),
  });
});

router.post("/token/:tokenId/enable", requireAdmin, (req, res) => {
  const token = TokenService.getToken(req.params.tokenId);
  if (!token) {
    res.status(404).json({ error: "Token nao encontrado." });
    return;
  }

  if (Date.now() > token.expiresAt) {
    TokenService.markExpired(token);
    res.status(400).json({ error: "TOKEN_EXPIRED_USE_EXTEND" });
    return;
  }

  TokenService.enableToken(token);
  res.json({
    message: "Token habilitado.",
    tokenData: toPublicToken(token, resolveAccessBaseUrl(req)),
  });
});

router.post("/token/:tokenId/extend", requireAdmin, (req, res) => {
  try {
    const token = TokenService.getToken(req.params.tokenId);
    if (!token) {
      res.status(404).json({ error: "Token nao encontrado." });
      return;
    }

    const { minutes } = parseExtendPayload(req.body);
    TokenService.extendToken(token, minutes);

    res.json({
      message: "Token estendido com sucesso.",
      tokenData: toPublicToken(token, resolveAccessBaseUrl(req)),
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Erro ao estender token.",
    });
  }
});

router.patch("/token/:tokenId", requireAdmin, (req, res) => {
  try {
    const token = TokenService.getToken(req.params.tokenId);
    if (!token) {
      res.status(404).json({ error: "Token nao encontrado." });
      return;
    }

    const update = parseUpdateTokenPayload(req.body);
    TokenService.updateToken(token, update);

    res.json({
      message: "Token atualizado.",
      tokenData: toPublicToken(token, resolveAccessBaseUrl(req)),
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Erro ao atualizar token.",
    });
  }
});

router.delete("/token/:tokenId", requireAdmin, (req, res) => {
  const token = TokenService.getToken(req.params.tokenId);
  if (!token) {
    res.status(404).json({ error: "Token nao encontrado." });
    return;
  }

  TokenService.deleteToken(token.id);

  res.json({
    message: "Token removido.",
  });
});

export default router;
