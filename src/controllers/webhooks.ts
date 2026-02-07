import * as z from 'zod';
import { AppDataSource } from '../database';
import { RegisteredWebhook } from '../entities/RegisteredWebhook';
import { logger } from '../logger';
import axios from 'axios';

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

const triggerSchema = z.object({
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  content: z.record(z.string(), z.any()),
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
    const webhooks = await repo.find({ where });
    return res.json(webhooks);
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
    const repo = AppDataSource.getRepository(RegisteredWebhook);
    // Find matching enabled webhooks for resource
    const webhooks = await repo.find({
      where: {
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        enabled: true,
      },
    });
    if (webhooks.length === 0) {
      logger.info(req, 'No enabled webhooks found for trigger', { resourceType: data.resourceType, resourceId: data.resourceId });
      return res.json({ message: 'No webhooks triggered', success: 0, failure: 0 });
    }
    // Send in parallel (fire-and-forget style; use axios with per-webhook timeouts)
    const results = await Promise.allSettled(
      webhooks.map(async (webhook) => {
        try {
          await axios.post(webhook.webhookUrl, data.content, {
            headers: webhook.headers || {},
            timeout: webhook.requestTimeout * 1000,  // overall timeout (ms); connect covered
          });
          return { success: true, url: webhook.webhookUrl };
        } catch (err: any) {
          return { success: false, url: webhook.webhookUrl, error: err.message };
        }
      })
    );
    const successCount = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
    const failureCount = results.length - successCount;
    // Summary log
    logger.info(req, 'Webhook trigger completed', {
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      total: results.length,
      successCount,
      failureCount,
    });
    return res.json({ message: 'Trigger completed', success: successCount, failure: failureCount });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    return res.status(400).json({ error: (error as Error).message });
  }
};
