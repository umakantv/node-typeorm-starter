import { Request, Response } from 'express';
import { AppDataSource } from '../database';
import { Workflow } from '../entities/Workflow';
import { ApprovalTask, ApprovalStatus } from '../entities/ApprovalTask';
import { z } from 'zod';
import { Like } from 'typeorm';
import { randomUUID } from 'crypto';
import { logger } from '../logger';

// Zod schemas (moved from index.ts)
const approvalSchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(1),
  allowedRoles: z.array(z.string().min(1)),
  approvalCountsRequired: z.number().int().min(1),
});

const createWorkflowSchema = z.object({
  name: z.string().min(1),
  resourceType: z.string().min(1),
  enabled: z.boolean().default(true),
  approvals: z.array(approvalSchema).min(1).refine(
    (approvals) => {
      const levels = approvals.map((a) => a.level).sort((a, b) => a - b);
      const uniqueLevels = [...new Set(levels)];
      if (uniqueLevels.length !== levels.length) return false;  // No duplicates
      return levels.every((level, index) => level === index + 1);  // Consecutive from 1
    },
    { message: 'Approval levels must be consecutive integers starting from 1 with no duplicates or gaps (e.g., [1, 2, 3])' }
  ),  // At least one approval level required
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field (name or enabled) must be provided' });

// Query validation schemas for list/search APIs (allowed fields only; numbers coerced for pagination)
const listWorkflowsQuerySchema = z.object({
  search: z.string().optional(),
  resourceType: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
}).strict();  // Reject unknown fields (owner* enforced from auth context)

const listApprovalTasksQuerySchema = z.object({
  search: z.string().optional(),
  status: z.nativeEnum(ApprovalStatus).optional(),
  workflowId: z.string().optional(),
  resourceId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
}).strict();  // Reject unknown fields

// Custom error for auth/ownership (extends Error; errorCode matches HTTP status for easy handling)
class CustomAuthError extends Error {
  errorCode: number;
  constructor(errorCode: number, message: string) {
    super(message);
    this.name = 'CustomAuthError';
    this.errorCode = errorCode;
  }
}

// Reusable ownership enforcer (uses req.client* from auth; minimizes DB calls by query where or single verify)
const enforceClientOwnership = (req: any, ownerType: string, ownerId: string) => {
  const clientType = req.clientType;
  const clientId = req.clientId;
  if (ownerType !== clientType || ownerId !== clientId) {
    throw new CustomAuthError(403, 'Unauthorized: resource does not belong to client');
  }
};

// List/search workflows
export const listWorkflowsHandler = async (req: any, res: any) => {
  try {
    // Validate only allowed query fields (strict; 400 on extras/invalid)
    const validated = listWorkflowsQuerySchema.parse(req.query);

    const workflowRepo = AppDataSource.getRepository(Workflow);
    const { search, resourceType, page = 1, limit = 10 } = validated;  // owner* overridden by client context

    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, limit);  // Cap limit
    const skip = (pageNum - 1) * limitNum;

    // Build where (always enforce client ownership to minimize calls; support other filters)
    const where: any = {
      ownerType: req.clientType,
      ownerId: req.clientId,
    };
    if (resourceType) where.resourceType = resourceType;
    if (search) {
      where.name = Like(`%${search}%`);
    }

    const [workflows, total] = await workflowRepo.findAndCount({
      where,
      relations: ['approvals'],
      skip,
      take: limitNum,
      order: { createdAt: 'DESC' },
    });

    logger.info(req, 'Workflows listed', { count: workflows.length, total, page: pageNum });
    res.json({
      data: workflows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (error: any) {
    logger.error(req, 'Failed to list workflows', { error: error.message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Create workflow
export const createWorkflowHandler = async (req: any, res: any) => {
  try {
    // Validate payload (owner* removed; set from auth context)
    const validated = createWorkflowSchema.parse(req.body);
    const workflowRepo = AppDataSource.getRepository(Workflow);

    // Pre-generate IDs; set owner from req.client* (enforce via context)
    const workflowId = randomUUID();
    const workflow = workflowRepo.create({
      id: workflowId,
      name: validated.name,
      resourceType: validated.resourceType,
      ownerType: req.clientType,
      ownerId: req.clientId,
      enabled: validated.enabled,
      approvals: validated.approvals.map((app: any) => ({
        id: randomUUID(),
        ...app,
      })),
    });

    const saved = await workflowRepo.save(workflow);
    logger.info(req, 'Workflow created', { workflowId: saved.id });
    res.status(201).json(saved);
  } catch (error: any) {
    logger.error(req, 'Failed to create workflow', { error: error.message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Update workflow (only allowed fields: name, enabled; PATCH /workflows/:id)
export const updateWorkflowHandler = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    // Validate only allowed fields
    const validated = updateWorkflowSchema.parse(req.body);
    const workflowRepo = AppDataSource.getRepository(Workflow);

    // Fetch with client ownership (single call; 404 hides existence from other clients)
    const workflow = await workflowRepo.findOneBy({
      id,
      ownerType: req.clientType,
      ownerId: req.clientId,
    });
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Apply only provided fields
    Object.assign(workflow, validated);
    const updated = await workflowRepo.save(workflow);

    // Reload with relations to include approvals in response (like list endpoint)
    const updatedWithRelations = await workflowRepo.findOne({
      where: { id },
      relations: ['approvals'],
    });

    logger.info(req, 'Workflow updated', { workflowId: id });
    res.json(updatedWithRelations || updated);
  } catch (error: any) {
    logger.error(req, 'Failed to update workflow', { error: error.message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Create ApprovalTask (simple create with pre-gen ID; status/nextReviewLevel default internally to Pending/1 - controlled by future approve/reject logic)
const createApprovalTaskSchema = z.object({
  workflowId: z.string().min(1),
  resourceId: z.string().min(1),
});

export const createApprovalTaskHandler = async (req: any, res: any) => {
  try {
    // Validate payload
    const validated = createApprovalTaskSchema.parse(req.body);
    const taskRepo = AppDataSource.getRepository(ApprovalTask);
    const workflowRepo = AppDataSource.getRepository(Workflow);

    // Validate workflow exists, enabled, and belongs to client (single call)
    const workflow = await workflowRepo.findOneBy({
      id: validated.workflowId,
      enabled: true,
      ownerType: req.clientType,
      ownerId: req.clientId,
    });
    if (!workflow) {
      return res.status(400).json({ error: 'Workflow not found or not enabled' });
    }

    // Pre-generate ID; status/nextReviewLevel default internally
    const taskId = randomUUID();
    const task = taskRepo.create({
      id: taskId,
      workflowId: validated.workflowId,
      resourceId: validated.resourceId,
      status: ApprovalStatus.Pending,
      nextReviewLevel: 1,
    });

    const saved = await taskRepo.save(task);

    const savedWithRelations = await taskRepo.findOne({
      where: { id: taskId },
      relations: ['workflow', 'workflow.approvals'],
    });

    logger.info(req, 'ApprovalTask created', { taskId: saved.id });
    res.status(201).json(savedWithRelations || saved);
  } catch (error: any) {
    logger.error(req, 'Failed to create ApprovalTask', { error: error.message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const getApprovalTaskHandler = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const taskRepo = AppDataSource.getRepository(ApprovalTask);

    const task = await taskRepo.findOne({
      where: { id },
      relations: ['workflow', 'workflow.approvals'],
    });

    if (!task) {
      return res.status(404).json({ error: 'ApprovalTask not found' });
    }

    // Enforce ownership on linked workflow (single fetch + check)
    enforceClientOwnership(req, task.workflow.ownerType, task.workflow.ownerId);

    logger.info(req, 'ApprovalTask fetched', { taskId: id });
    res.json(task);
  } catch (error: any) {
    logger.error(req, 'Failed to fetch ApprovalTask', { error: error.message });
    if (error instanceof CustomAuthError) {
      return res.status(error.errorCode).json({ error: 'Forbidden: access denied to resource' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listApprovalTasksHandler = async (req: any, res: any) => {
  try {
    // Validate only allowed query fields (strict; 400 on extras/invalid)
    const validated = listApprovalTasksQuerySchema.parse(req.query);

    const taskRepo = AppDataSource.getRepository(ApprovalTask);
    const { search, status, workflowId, resourceId, page = 1, limit = 10 } = validated;

    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, limit);
    const skip = (pageNum - 1) * limitNum;

    // Use QueryBuilder for ownership filter via workflow join (single DB call, enforces client access; supports other filters)
    const query = taskRepo.createQueryBuilder('task')
      .leftJoinAndSelect('task.workflow', 'workflow')
      .leftJoinAndSelect('workflow.approvals', 'approvals')
      .where('workflow.ownerType = :clientType AND workflow.ownerId = :clientId', {
        clientType: req.clientType,
        clientId: req.clientId,
      });

    // Add other filters
    if (status) query.andWhere('task.status = :status', { status });
    if (workflowId) query.andWhere('task.workflowId = :workflowId', { workflowId });
    if (resourceId) query.andWhere('task.resourceId = :resourceId', { resourceId });
    if (search) {
      query.andWhere('task.resourceId LIKE :search', { search: `%${search}%` });
    }

    query.skip(skip).take(limitNum).orderBy('task.createdAt', 'DESC');

    const [tasks, total] = await query.getManyAndCount();

    logger.info(req, 'ApprovalTasks listed', { count: tasks.length, total, page: pageNum });
    res.json({
      data: tasks,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (error: any) {
    logger.error(req, 'Failed to list ApprovalTasks', { error: error.message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};
