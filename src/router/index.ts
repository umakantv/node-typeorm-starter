import express, { Request, Response, NextFunction, Express } from 'express';
import type { Route } from './types';
import { randomUUID } from 'crypto';
import { logger } from '../logger';

// Wrap handler: FIRST set requestId (from header or generate UUID) for tracing across services/logs.
// Then enrich with routeName. Extend here for auth etc.
// Logs "Request started" + "Request ended..." (with timing/status) for every request.
const wrapHandler = (route: Route) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Request ID as first step (before any processing)
    if (!(req as any).requestId) {
      const requestId = (req.headers['x-request-id'] as string) || randomUUID();
      (req as any).requestId = requestId;
      res.setHeader('X-Request-ID', requestId);  // Propagate to response
    }
    (req as any).routeName = route.route_name;  // For logging

    const startTime = Date.now();
    logger.info(req, 'Request started');  // Start log with requestId/routeName

    // Log end after response (handles async handlers)
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info(req, 'Request ended', {
        statusCode: res.statusCode,
        durationMs: duration,
      });
    });

    return route.handler(req, res, next);
  };
};

// Re-export for convenience
export type { Route } from './types';

export const createRouter = (routes: Route[]): Express => {
  const app = express();

  // Basic middleware (extend with body-parser, etc. later)
  app.use(express.json());

  // Debug: log all routes being registered (to diagnose 404s)
  console.log('DEBUG: Creating router with routes count:', routes.length);
  routes.forEach((route) => {
    console.log(`DEBUG: Registering ${route.method} ${route.endpoint} (handler: ${typeof route.handler})`);
    // Use dynamic access for robustness (supports PATCH etc. across Express versions)
    const methodName = route.method.toLowerCase();
    (app as any)[methodName](route.endpoint, wrapHandler(route));
  });
  console.log('DEBUG: All routes registered; server ready for requests.');

  return app;
};
