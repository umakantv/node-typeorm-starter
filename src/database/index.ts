import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config, isProd } from '../config/config';

// Import entities explicitly to ensure metadata is registered (fixes runtime issues like in test scripts)
import { Workflow } from '../entities/Workflow';
import { WorkflowApprovals } from '../entities/WorkflowApprovals';
import { ApprovalTask } from '../entities/ApprovalTask';

// Determine DB_TYPE: in prod always 'postgres'; else from config
const getDbType = (): 'postgres' | 'sqlite' | 'sqlite:memory' => {
  if (isProd()) {
    return 'postgres';
  }
  return config.DB_TYPE;
};

const dbType = getDbType();

let dataSourceOptions: any; // TypeORM options

if (dbType === 'sqlite' || dbType === 'sqlite:memory') {
  // SQLite (using better-sqlite3 driver) for dev/test; supports :memory:
  const isMemory = dbType === 'sqlite:memory';
  dataSourceOptions = {
    type: 'better-sqlite3' as const,
    database: isMemory ? ':memory:' : (config.DB_DATABASE || './data.sqlite'),
    synchronize: true, // Auto-create tables (dev only; disable in prod)
    logging: config.LOG_LEVEL === 'debug',
    // Entities as classes (ensures metadata); globs for migrations/subscribers only
    entities: [Workflow, WorkflowApprovals, ApprovalTask],
    migrations: [`${__dirname}/../../migrations/**/*{.ts,.js}`],
    subscribers: [`${__dirname}/../../subscribers/**/*{.ts,.js}`],
  };
} else {
  // Postgres (default for prod or explicit)
  dataSourceOptions = {
    type: 'postgres' as const,
    host: config.DB_HOST,
    port: config.DB_PORT,
    username: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_DATABASE,
    synchronize: !isProd(), // Only sync in non-prod
    logging: config.LOG_LEVEL === 'debug',
    // Entities as classes (ensures metadata); globs for migrations/subscribers only
    entities: [Workflow, WorkflowApprovals, ApprovalTask],
    migrations: [`${__dirname}/../../migrations/**/*{.ts,.js}`],
    subscribers: [`${__dirname}/../../subscribers/**/*{.ts,.js}`],
  };
}

export const AppDataSource = new DataSource(dataSourceOptions);
