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
  ownerType: z.string().min(1),
  ownerId: z.string().min(1),
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

// List/search workflows
export const listWorkflowsHandler = async (req: any, res: any) => {
  try {
    const workflowRepo = AppDataSource.getRepository(Workflow);
    const { search, resourceType, ownerType, ownerId, page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));  // Cap limit
    const skip = (pageNum - 1) * limitNum;

    // Build where conditions (simple LIKE for search)
    const where: any = {};
    if (resourceType) where.resourceType = resourceType;
    if (ownerType) where.ownerType = ownerType;
    if (ownerId) where.ownerId = ownerId;
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
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create workflow
export const createWorkflowHandler = async (req: any, res: any) => {
  try {
    // Validate payload
    const validated = createWorkflowSchema.parse(req.body);
    const workflowRepo = AppDataSource.getRepository(Workflow);

    // Pre-generate IDs
    const workflowId = randomUUID();
    const workflow = workflowRepo.create({
      id: workflowId,
      name: validated.name,
      resourceType: validated.resourceType,
      ownerType: validated.ownerType,
      ownerId: validated.ownerId,
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

    const workflow = await workflowRepo.findOneBy({ id });
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

    // Validate workflow exists and is enabled
    const workflow = await workflowRepo.findOneBy({ id: validated.workflowId, enabled: true });
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
    logger.info(req, 'ApprovalTask created', { taskId: saved.id });
    res.status(201).json(saved);
  } catch (error: any) {
    logger.error(req, 'Failed to create ApprovalTask', { error: error.message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};
