import { config, isProd } from './config/config';
import { AppDataSource } from './database';
import { createRouter, type Route } from './router';
import { logger } from './logger';
// Import webhook handlers (validations/schemas now in controllers)
import {
  registerWebhookHandler,
  searchWebhooksHandler,
  patchWebhookHandler,
  triggerWebhookHandler,
} from './controllers/webhooks';

// Sample route handlers (demo; use entities in real; logger uses req.requestId)
const healthHandler = (req: any, res: any) => {
  logger.info(req, 'Health check called');
  res.json({ status: 'ok', routeName: req.routeName, env: config.NODE_ENV, requestId: req.requestId });
};

const demoHandler = async (req: any, res: any) => {
  logger.debug(req, 'Demo route processing started');
  res.json({ message: 'Demo route with enriched req.routeName and requestId', routeName: req.routeName, requestId: req.requestId });
};

// Test handlers for webhook trigger (success=200 immediate, failure=400, timeout=200 after 80s delay)
const testSuccessHandler = (req: any, res: any) => {
  res.status(200).json({ status: 'success', message: 'Webhook received successfully' });
};

const testFailureHandler = (req: any, res: any) => {
  res.status(400).json({ status: 'failure', message: 'Webhook processing failed' });
};

const testTimeoutHandler = async (req: any, res: any) => {
  // Simulate long delay to test requestTimeout
  await new Promise((resolve) => setTimeout(resolve, 80000));
  res.status(200).json({ status: 'success', message: 'Webhook received after delay' });
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
  {
    route_name: 'register_webhook',
    method: 'POST',
    endpoint: '/api/webhooks/register',
    handler: registerWebhookHandler,
  },
  {
    route_name: 'search_webhooks',
    method: 'POST',
    endpoint: '/api/webhooks/search',
    handler: searchWebhooksHandler,
  },
  {
    route_name: 'patch_webhook',
    method: 'PATCH',
    endpoint: '/api/webhooks/:id',
    handler: patchWebhookHandler,
  },
  {
    route_name: 'trigger_webhook',
    method: 'POST',
    endpoint: '/api/webhooks/trigger',
    handler: triggerWebhookHandler,
  },
  {
    route_name: 'test_webhook_success',
    method: 'POST',
    endpoint: '/api/webhooks/test_success',
    handler: testSuccessHandler,
  },
  {
    route_name: 'test_webhook_failure',
    method: 'POST',
    endpoint: '/api/webhooks/test_failure',
    handler: testFailureHandler,
  },
  {
    route_name: 'test_webhook_timeout',
    method: 'POST',
    endpoint: '/api/webhooks/test_timeout',
    handler: testTimeoutHandler,
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
