import * as dotenv from 'dotenv';

dotenv.config();

export interface Config {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DB_HOST: string;
  DB_USER: string;
  DB_PORT: number;
  DB_DATABASE: string;
  DB_PASSWORD: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  // DB_TYPE only applicable in non-prod (dev/test): 'postgres' | 'sqlite' | 'sqlite:memory'
  // In prod, always forced to postgres.
  DB_TYPE: 'postgres' | 'sqlite' | 'sqlite:memory';
}

export const config: Config = {
  NODE_ENV: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_USER: process.env.DB_USER || '',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_DATABASE: process.env.DB_DATABASE || '',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  LOG_LEVEL: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  DB_TYPE: ((process.env.DB_TYPE as any) || 'sqlite') as 'postgres' | 'sqlite' | 'sqlite:memory',
};

// In production, only postgres is allowed (per requirements). DB_TYPE from .env is ignored.
export const isProd = (): boolean => config.NODE_ENV === 'production';
