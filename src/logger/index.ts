import winston from 'winston';
import { config } from '../config/config';
import { randomUUID } from 'crypto';

// Base Winston logger (JSON structured, level from config)
const loggerInstance = winston.createLogger({
  level: config.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    // Add file transport etc. later
  ],
});

// Public API: logger.info(req, msg, meta?) etc. – includes requestId/routeName only for request logs (omit 'unknown')
export const logger = {
  info: (req: any, message: string, meta: any = {}) => {
    const logMeta: any = { ...meta };
    const requestId = req?.requestId;
    if (requestId && requestId !== 'unknown') {
      logMeta.requestId = requestId;
    }
    const routeName = req?.routeName;
    if (routeName) {
      logMeta.routeName = routeName;
    }
    loggerInstance.info(message, logMeta);
  },
  error: (req: any, message: string, meta: any = {}) => {
    const logMeta: any = { ...meta };
    const requestId = req?.requestId;
    if (requestId && requestId !== 'unknown') {
      logMeta.requestId = requestId;
    }
    const routeName = req?.routeName;
    if (routeName) {
      logMeta.routeName = routeName;
    }
    loggerInstance.error(message, logMeta);
  },
  debug: (req: any, message: string, meta: any = {}) => {
    const logMeta: any = { ...meta };
    const requestId = req?.requestId;
    if (requestId && requestId !== 'unknown') {
      logMeta.requestId = requestId;
    }
    const routeName = req?.routeName;
    if (routeName) {
      logMeta.routeName = routeName;
    }
    loggerInstance.debug(message, logMeta);
  },
  warn: (req: any, message: string, meta: any = {}) => {
    const logMeta: any = { ...meta };
    const requestId = req?.requestId;
    if (requestId && requestId !== 'unknown') {
      logMeta.requestId = requestId;
    }
    const routeName = req?.routeName;
    if (routeName) {
      logMeta.routeName = routeName;
    }
    loggerInstance.warn(message, logMeta);
  },
};
