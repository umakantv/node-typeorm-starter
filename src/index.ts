import { config, isProd } from './config/config';
import { AppDataSource } from './database';
import { createRouter, type Route } from './router';
import { logger } from './logger';

// Sample route handlers (demo; use entities in real; logger uses req.requestId)
const healthHandler = (req: any, res: any) => {
  logger.info(req, 'Health check called');
  res.json({ status: 'ok', routeName: req.routeName, env: config.NODE_ENV, requestId: req.requestId });
};

const demoHandler = async (req: any, res: any) => {
  logger.debug(req, 'Demo route processing started');
  res.json({ message: 'Demo route with enriched req.routeName and requestId', routeName: req.routeName, requestId: req.requestId });
};

// Define routes per spec (enriched by wrapper for logging etc.)
const routes: Route[] = [
  {
    route_name: 'health_check',
    method: 'GET',
    endpoint: '/health',
    handler: healthHandler,
  },
  {
    route_name: 'demo_route',
    method: 'GET',
    endpoint: '/api/demo',
    handler: demoHandler,
  },
];

async function bootstrap() {
  // Use logger (requestId N/A at bootstrap)
  logger.info({} as any, 'Config loaded', {
    NODE_ENV: config.NODE_ENV,
    PORT: config.PORT,
    LOG_LEVEL: config.LOG_LEVEL,
    DB_TYPE: isProd() ? 'postgres (forced in prod)' : config.DB_TYPE,
  });

  // Init DB
  try {
    await AppDataSource.initialize();
    logger.info({} as any, 'Database initialized successfully with TypeORM.');
  } catch (error) {
    logger.error({} as any, 'DB init error', { error });
    process.exit(1);
  }

  // Create router with routes
  const app = createRouter(routes);

  // Start server
  const server = app.listen(config.PORT, () => {
    logger.info({} as any, 'Server started', { port: config.PORT, env: config.NODE_ENV });
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info({} as any, 'Server shutdown initiated');
    server.close();
    AppDataSource.destroy();
  });
}

bootstrap();
