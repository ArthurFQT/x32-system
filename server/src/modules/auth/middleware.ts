import { Request, Response, NextFunction } from "express";
import { ADMIN_API_KEY } from "../../config/constants";
import { logAction } from "../../shared/logger";

export function requireAdminMiddleware(req: Request, res: Response, next: NextFunction): void {
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
