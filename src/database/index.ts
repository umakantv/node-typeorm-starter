import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config, isProd } from '../config/config';

// Import entities explicitly (for metadata registration)
import { RegisteredWebhook } from '../entities/RegisteredWebhook';
import { WebhookRun } from '../entities/WebhookRun';
import { WebhookExecution } from '../entities/WebhookExecution';
import { Schedule } from '../entities/Schedule';

const getDbType = (): 'postgres' | 'sqlite' | 'sqlite:memory' => {
  if (isProd()) {
    return 'postgres';
  }
  return config.DB_TYPE;
};

const dbType = getDbType();

let dataSourceOptions: any;

if (dbType === 'sqlite' || dbType === 'sqlite:memory') {
  const isMemory = dbType === 'sqlite:memory';
  dataSourceOptions = {
    type: 'better-sqlite3' as const,
    database: isMemory ? ':memory:' : (config.DB_DATABASE || './webhooks.sqlite'),
    synchronize: true,
    logging: config.LOG_LEVEL === 'debug',
    entities: [RegisteredWebhook, WebhookRun, WebhookExecution, Schedule],
    migrations: [`${__dirname}/../../migrations/**/*{.ts,.js}`],
    subscribers: [`${__dirname}/../../subscribers/**/*{.ts,.js}`],
  };
} else {
  dataSourceOptions = {
    type: 'postgres' as const,
    host: config.DB_HOST,
    port: config.DB_PORT,
    username: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_DATABASE,
    synchronize: !isProd(),
    logging: config.LOG_LEVEL === 'debug',
    entities: [RegisteredWebhook, WebhookRun, WebhookExecution, Schedule],
    migrations: [`${__dirname}/../../migrations/**/*{.ts,.js}`],
    subscribers: [`${__dirname}/../../subscribers/**/*{.ts,.js}`],
  };
}

export const AppDataSource = new DataSource(dataSourceOptions);
