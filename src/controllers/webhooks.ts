import * as z from 'zod';
import { AppDataSource } from '../database';
import { RegisteredWebhook } from '../entities/RegisteredWebhook';
import { WebhookRun } from '../entities/WebhookRun';
import { WebhookExecution } from '../entities/WebhookExecution';
import { logger } from '../logger';
import axios from 'axios';
import { randomUUID } from 'crypto';

// Schemas (moved from index; search now includes optional id)
const registerSchema = z.object({
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  ownerType: z.string().min(1),
  ownerId: z.string().min(1),
  webhookType: z.literal('http'),
  webhookUrl: z.string().url(),
  headers: z.record(z.string(), z.any()).nullable().optional().default(null),
  connectionTimeout: z.number().int().positive(),
  requestTimeout: z.number().int().positive(),
}).strict();

const searchSchema = z.object({
  id: z.string().uuid().optional(),
  resourceType: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  ownerType: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  webhookType: z.literal('http').optional(),
  webhookUrl: z.string().url().optional(),
  enabled: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
  orderBy: z.string().optional().default('id'),
  orderByDir: z.enum(['ASC', 'DESC']).optional().default('DESC'),
}).strict();

const patchSchema = z.object({
  resourceType: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  ownerType: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  webhookType: z.literal('http').optional(),
  webhookUrl: z.string().url().optional(),
  headers: z.record(z.string(), z.any()).nullable().optional(),
  connectionTimeout: z.number().int().positive().optional(),
  requestTimeout: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
}).strict();

const runsSearchSchema = z.object({
  resourceType: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
  orderBy: z.string().optional().default('id'),
  orderByDir: z.enum(['ASC', 'DESC']).optional().default('DESC'),
}).strict();

const execSearchSchema = z.object({
  webhookRunId: z.string().uuid().optional(),
  webhookId: z.string().uuid().optional(),
  result: z.enum(['success', 'failure']).optional(),
  statusCode: z.number().int().optional(),
  // pagination
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
  orderBy: z.string().optional().default('id'),
  orderByDir: z.enum(['ASC', 'DESC']).optional().default('DESC'),
}).strict();

const triggerSchema = z.object({
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  content: z.record(z.string(), z.any()),
  triggeredBy: z.string().min(1),
}).strict();

// Handlers (moved; trigger uses parallel axios calls to matching enabled webhooks)
export const registerWebhookHandler = async (req: any, res: any) => {
  try {
    const data = registerSchema.parse(req.body);
    const repo = AppDataSource.getRepository(RegisteredWebhook);
    const existing = await repo.findOne({
      where: {
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        ownerType: data.ownerType,
        ownerId: data.ownerId,
        webhookUrl: data.webhookUrl,
      },
    });
    if (existing) {
      return res.status(400).json({ error: 'Webhook already exists for this resource/owner/endpoint' });
    }
    const webhook = repo.create(data);
    const saved = await repo.save(webhook);
    return res.status(201).json(saved);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    return res.status(400).json({ error: (error as Error).message });
  }
};

export const searchWebhooksHandler = async (req: any, res: any) => {
  try {
    const filters = searchSchema.parse(req.body);
    const repo = AppDataSource.getRepository(RegisteredWebhook);
    const where: any = {};
    if (filters.id !== undefined) where.id = filters.id;
    if (filters.resourceType !== undefined) where.resourceType = filters.resourceType;
    if (filters.resourceId !== undefined) where.resourceId = filters.resourceId;
    if (filters.ownerType !== undefined) where.ownerType = filters.ownerType;
    if (filters.ownerId !== undefined) where.ownerId = filters.ownerId;
    if (filters.webhookType !== undefined) where.webhookType = filters.webhookType;
    if (filters.webhookUrl !== undefined) where.webhookUrl = filters.webhookUrl;
    if (filters.enabled !== undefined) where.enabled = filters.enabled;
    const [webhooks, total] = await repo.findAndCount({
      where,
      take: filters.limit,
      skip: filters.offset,
      order: { [filters.orderBy]: filters.orderByDir },
    });
    return res.json({ items: webhooks, total, limit: filters.limit, offset: filters.offset });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    return res.status(400).json({ error: (error as Error).message });
  }
};

export const searchWebhookRunsHandler = async (req: any, res: any) => {
  try {
    const filters = runsSearchSchema.parse(req.body);
    const runRepo = AppDataSource.getRepository(WebhookRun);
    // QB for counts + pagination + orderBy on success/failureCount
    const qb = runRepo.createQueryBuilder('run')
      .select('run.*')
      .addSelect(
        subQb => subQb
          .select('COUNT(*)')
          .from(WebhookExecution, 'exec')
          .where('exec.webhookRunId = run.id')
          .andWhere("exec.result = 'success'"),
        'successCount'
      )
      .addSelect(
        subQb => subQb
          .select('COUNT(*)')
          .from(WebhookExecution, 'exec')
          .where('exec.webhookRunId = run.id')
          .andWhere("exec.result = 'failure'"),
        'failureCount'
      );
    if (filters.resourceType !== undefined) {
      qb.andWhere('run.resourceType = :rt', { rt: filters.resourceType });
    }
    if (filters.resourceId !== undefined) {
      qb.andWhere('run.resourceId = :ri', { ri: filters.resourceId });
    }
    qb.take(filters.limit).skip(filters.offset);
    const orderField = ['id', 'resourceType', 'resourceId', 'triggeredAt', 'successCount', 'failureCount'].includes(filters.orderBy) ? filters.orderBy : 'id';
    if (['successCount', 'failureCount'].includes(orderField)) {
      qb.orderBy(orderField, filters.orderByDir);
    } else {
      qb.orderBy(`run.${orderField}`, filters.orderByDir);
    }
    const runs = await qb.getRawMany();
    const totalQb = runRepo.createQueryBuilder('run').select('COUNT(run.id) as total');
    if (filters.resourceType !== undefined) totalQb.andWhere('run.resourceType = :rt', { rt: filters.resourceType });
    if (filters.resourceId !== undefined) totalQb.andWhere('run.resourceId = :ri', { ri: filters.resourceId });
    const totalRes = await totalQb.getRawOne();
    const total = parseInt(totalRes?.total || '0', 10);
    return res.json({ items: runs, total, limit: filters.limit, offset: filters.offset });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    return res.status(400).json({ error: (error as Error).message });
  }
};

export const searchWebhookExecutionsHandler = async (req: any, res: any) => {
  try {
    const filters = execSearchSchema.parse(req.body);
    const repo = AppDataSource.getRepository(WebhookExecution);
    const where: any = {};
    if (filters.webhookRunId !== undefined) where.webhookRunId = filters.webhookRunId;
    if (filters.webhookId !== undefined) where.webhookId = filters.webhookId;
    if (filters.result !== undefined) where.result = filters.result;
    if (filters.statusCode !== undefined) where.statusCode = filters.statusCode;
    const [executions, total] = await repo.findAndCount({
      where,
      take: filters.limit,
      skip: filters.offset,
      order: { [filters.orderBy]: filters.orderByDir },
    });
    return res.json({ items: executions, total, limit: filters.limit, offset: filters.offset });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    return res.status(400).json({ error: (error as Error).message });
  }
};

export const patchWebhookHandler = async (req: any, res: any) => {
  try {
    const id = req.params?.id;
    if (!id) {
      return res.status(400).json({ error: 'Webhook ID is required' });
    }
    const updates = patchSchema.parse(req.body);
    const repo = AppDataSource.getRepository(RegisteredWebhook);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    Object.assign(existing, updates);
    const saved = await repo.save(existing);
    return res.json(saved);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    return res.status(400).json({ error: (error as Error).message });
  }
};

export const triggerWebhookHandler = async (req: any, res: any) => {
  try {
    const data = triggerSchema.parse(req.body);
    const webhookRepo = AppDataSource.getRepository(RegisteredWebhook);
    const runRepo = AppDataSource.getRepository(WebhookRun);
    const execRepo = AppDataSource.getRepository(WebhookExecution);

    // Find matching enabled webhooks for resource
    const webhooks = await webhookRepo.find({
      where: {
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        enabled: true,
      },
    });

    const runId = randomUUID();
    const now = new Date();
    const run = runRepo.create({
      id: runId,
      resourceId: data.resourceId,
      resourceType: data.resourceType,
      content: data.content,
      triggeredAt: now,
      triggeredBy: data.triggeredBy,
      completedAt: null,
    });
    await runRepo.save(run);

    if (webhooks.length === 0) {
      await runRepo.update({ id: runId }, { completedAt: new Date() });
      logger.info(req, 'No enabled webhooks found for trigger', { resourceType: data.resourceType, resourceId: data.resourceId });
      return res.json({ message: 'No webhooks triggered', success: 0, failure: 0 });
    }

    // Parallel triggers + capture details for bulk exec save (optimal write; always save all attempts)
    const execPromises = webhooks.map(async (webhook) => {
      const start = new Date();
      let result: 'success' | 'failure' = 'failure';
      let statusCode: number | null = null;
      let responseText: string | null = null;
      let axiosError: any = null;
      try {
        const axiosResp = await axios.post(webhook.webhookUrl, data.content, {
          headers: webhook.headers || {},
          timeout: webhook.requestTimeout * 1000,
          responseType: 'text',  // for raw response text
        });
        result = 'success';
        statusCode = axiosResp.status;
        responseText = String(axiosResp.data || '');
      } catch (err: any) {
        axiosError = err;
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
          statusCode = 408;
        } else {
          statusCode = err.response?.status || null;
        }
        responseText = err.response?.data ? String(err.response.data) : null;
      }
      const end = new Date();
      return execRepo.create({
        webhookRunId: runId,
        webhookId: webhook.id,
        ownerType: webhook.ownerType,
        ownerId: webhook.ownerId,
        webhookType: webhook.webhookType,
        webhookUrl: webhook.webhookUrl,
        headers: webhook.headers,
        result,
        statusCode,
        response: responseText,
        startedAt: start,
        endedAt: end,
      });
    });
    const executions = await Promise.all(execPromises);
    await execRepo.save(executions);  // bulk insert

    // Update run completion
    const completedAt = new Date();
    await runRepo.update({ id: runId }, { completedAt });

    // Counts from execs
    const successCount = executions.filter(e => e.result === 'success').length;
    const failureCount = executions.length - successCount;
    logger.info(req, 'Webhook trigger completed', {
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      total: executions.length,
      successCount,
      failureCount,
      runId,
    });
    return res.json({ message: 'Trigger completed', success: successCount, failure: failureCount });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    return res.status(400).json({ error: (error as Error).message });
  }
};
