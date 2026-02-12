import express, { Request, Response, NextFunction, Express } from 'express';
import type { Route } from './types';
import { randomUUID } from 'crypto';
import { logger } from '../logger';

// Separate auth middleware (separation of concerns; enforces headers, enriches req, or 401)
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const clientType = req.headers['x-account-type'] as string;
  const clientId = req.headers['x-account-id'] as string;
  if (!clientType || clientType !== 'service' || !clientId) {
    res.status(401).json({ error: 'Unauthorized Access' });
    return;
  }
  (req as any).clientType = clientType;
  (req as any).clientId = clientId;
  next();
};

// Wrap handler: uses separate authMiddleware to wrap route.handler (ensures timing logs for 401s)
const wrapHandler = (route: Route) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Request ID as first step (before any processing)
    if (!(req as any).requestId) {
      const requestId = (req.headers['x-request-id'] as string) || randomUUID();
      (req as any).requestId = requestId;
      res.setHeader('X-Request-ID', requestId);  // Propagate to response
    }

    // Early timing + finish listener (ensures end log even on auth fail/401)
    const startTime = Date.now();
    // Log end after response (handles async handlers + early auth fails)
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info(req, 'Request ended', {
        statusCode: res.statusCode,
        durationMs: duration,
      });
    });

    (req as any).routeName = route.route_name;  // For logging

    logger.info(req, 'Request started');  // Start log (before auth; 401s get started + ended)

    // Wrap original handler with auth (separation)
    return authMiddleware(req, res, () => route.handler(req, res, next));
  };
};

// Re-export for convenience
export type { Route } from './types';

export const createRouter = (routes: Route[]): Express => {
  const app = express();

  // Basic middleware (extend with body-parser, etc. later)
  app.use(express.json());

  // Register each route with wrapper
  routes.forEach((route) => {
    const method = route.method.toLowerCase() as keyof Express;
    (app[method] as any)(route.endpoint, wrapHandler(route));
  });

  return app;
};
