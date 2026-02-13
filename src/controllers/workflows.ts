import { Request, Response } from 'express';
import { AppDataSource } from '../database';
import { Workflow } from '../entities/Workflow';
import { ApprovalTask, ApprovalStatus } from '../entities/ApprovalTask';
import { WorkflowApprovals } from '../entities/WorkflowApprovals';
import { z } from 'zod';
import { Like, In } from 'typeorm';
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

// Helper: compute nextReviewRoles from workflow.approvals (for response only; not persisted)
const getNextReviewRoles = (task: any): string[] => {
  if (!task.nextReviewLevel || !task.workflow?.approvals) return [];
  const match = task.workflow.approvals.find((a: any) => a.level === task.nextReviewLevel);
  return match?.allowedRoles || [];
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

const createApprovalTaskSchema = z.object({
  workflowId: z.string().min(1),
  resourceId: z.string().min(1),
});

// Schema for approve endpoint (comment optional)
const approveTaskSchema = z.object({
  reviewerId: z.string().min(1),
  reviewerRoles: z.array(z.string().min(1)).min(1),
  comment: z.string().min(1).optional(),
});

// Schema for reject endpoint (comment mandatory)
const rejectTaskSchema = z.object({
  reviewerId: z.string().min(1),
  reviewerRoles: z.array(z.string().min(1)).min(1),
  comment: z.string().min(1),
});

// Schema for bulk discard (taskIds required; comment optional like approve)
const discardTasksSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1),
  reviewerId: z.string().min(1),
  reviewerRoles: z.array(z.string().min(1)).min(1),
  comment: z.string().min(1).optional(),
});

// Schema for bulk create approval tasks (workflow once, multiple resources)
const bulkCreateTasksSchema = z.object({
  workflowId: z.string().min(1),
  resourceIds: z.array(z.string().min(1)).min(1),
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
      actionHistory: [],
    });

    const saved = await taskRepo.save(task);

    const savedWithRelations = await taskRepo.findOne({
      where: { id: taskId },
      relations: ['workflow', 'workflow.approvals'],
    });

    logger.info(req, 'ApprovalTask created', { taskId: saved.id });
    // Add computed nextReviewRoles to response (from workflow.approvals)
    const responseData = savedWithRelations || saved;
    res.status(201).json({
      ...responseData,
      nextReviewRoles: getNextReviewRoles(responseData),
    });
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
    // Add computed nextReviewRoles to response
    res.json({
      ...task,
      nextReviewRoles: getNextReviewRoles(task),
    });
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
    // Add computed nextReviewRoles to each task in response
    const tasksWithRoles = tasks.map(task => ({
      ...task,
      nextReviewRoles: getNextReviewRoles(task),
    }));
    res.json({
      data: tasksWithRoles,
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

// Approve handler
export const approveApprovalTaskHandler = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const validated = approveTaskSchema.parse(req.body);
    const { reviewerId, reviewerRoles, comment } = validated;

    const taskRepo = AppDataSource.getRepository(ApprovalTask);
    const task = await taskRepo.findOne({
      where: { id },
      relations: ['workflow', 'workflow.approvals'],
    });

    if (!task) {
      return res.status(404).json({ error: 'ApprovalTask not found' });
    }

    // Enforce ownership (caller must own the workflow)
    enforceClientOwnership(req, task.workflow.ownerType, task.workflow.ownerId);

    // Check task state
    if (task.status === ApprovalStatus.Completed || task.status === ApprovalStatus.Rejected) {
      return res.status(400).json({ error: 'Task already completed or rejected' });
    }
    if (!task.nextReviewLevel) {
      return res.status(400).json({ error: 'No pending review level' });
    }

    // Find current level's approval config
    const currentApproval: WorkflowApprovals | undefined = task.workflow.approvals.find(
      (a: any) => a.level === task.nextReviewLevel
    );
    if (!currentApproval) {
      return res.status(400).json({ error: 'Approval level config not found' });
    }

    // Verify role match: at least one reviewerRole in allowedRoles
    const roleMatch = reviewerRoles.some((role: string) =>
      currentApproval.allowedRoles.includes(role)
    );
    if (!roleMatch) {
      return res.status(403).json({
        error: `Insufficient permissions. Current level ${task.nextReviewLevel} requires one of: ${currentApproval.allowedRoles.join(', ')}`,
      });
    }

    // On success: advance level or complete (simple logic; counts ignored for initial impl)
    const currentLevel = task.nextReviewLevel;
    const currentStatus = task.status;
    const maxLevel = Math.max(...task.workflow.approvals.map((a: any) => a.level));
    let nextLevel: number | null;
    let nextStatus: ApprovalStatus;
    if (currentLevel >= maxLevel) {
      nextStatus = ApprovalStatus.Completed;
      nextLevel = null;
    } else {
      nextStatus = ApprovalStatus.InProgress;
      nextLevel = currentLevel + 1;
    }
    task.status = nextStatus;
    task.nextReviewLevel = nextLevel;

    // Record history entry (per spec; push before save)
    const historyEntry = {
      reviewerId,
      reviewerRoles,
      actionType: 'approve',
      comment,  // optional (undefined if not provided)
      currentLevel,
      nextLevel,
      currentStatus,
      nextStatus,
      timestamp: new Date().toISOString(),
    };
    if (!task.actionHistory) {
      task.actionHistory = [];
    }
    task.actionHistory.push(historyEntry);

    // Save update
    await taskRepo.save(task);

    // Reload with relations for response
    const updatedTask = await taskRepo.findOne({
      where: { id },
      relations: ['workflow', 'workflow.approvals'],
    });

    logger.info(req, 'ApprovalTask approved', { taskId: id, reviewerId, level: currentLevel });
    // Add computed nextReviewRoles to response
    const responseData = updatedTask || task;
    res.json({
      ...responseData,
      nextReviewRoles: getNextReviewRoles(responseData),
    });
  } catch (error: any) {
    logger.error(req, 'Failed to approve ApprovalTask', { error: error.message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else if (error instanceof CustomAuthError) {
      return res.status(error.errorCode).json({ error: 'Forbidden: access denied to resource' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Reject handler
export const rejectApprovalTaskHandler = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const validated = rejectTaskSchema.parse(req.body);
    const { reviewerId, reviewerRoles, comment } = validated;

    const taskRepo = AppDataSource.getRepository(ApprovalTask);
    const task = await taskRepo.findOne({
      where: { id },
      relations: ['workflow', 'workflow.approvals'],
    });

    if (!task) {
      return res.status(404).json({ error: 'ApprovalTask not found' });
    }

    // Enforce ownership
    enforceClientOwnership(req, task.workflow.ownerType, task.workflow.ownerId);

    // Check task state
    if (task.status === ApprovalStatus.Completed || task.status === ApprovalStatus.Rejected) {
      return res.status(400).json({ error: 'Task already completed or rejected' });
    }
    if (!task.nextReviewLevel) {
      return res.status(400).json({ error: 'No pending review level' });
    }

    // Find current level's approval config (reuse role verify logic)
    const currentApproval: WorkflowApprovals | undefined = task.workflow.approvals.find(
      (a: any) => a.level === task.nextReviewLevel
    );
    if (!currentApproval) {
      return res.status(400).json({ error: 'Approval level config not found' });
    }

    // Verify role match
    const roleMatch = reviewerRoles.some((role: string) =>
      currentApproval.allowedRoles.includes(role)
    );
    if (!roleMatch) {
      return res.status(403).json({
        error: `Insufficient permissions. Current level ${task.nextReviewLevel} requires one of: ${currentApproval.allowedRoles.join(', ')}`,
      });
    }

    // Apply reject strategy: level 1 -> Rejected; else decrement level
    const currentLevel = task.nextReviewLevel;
    const currentStatus = task.status;
    let nextLevel: number | null;
    let nextStatus: ApprovalStatus;
    if (currentLevel === 1) {
      nextStatus = ApprovalStatus.Rejected;
      nextLevel = null;
    } else {
      nextStatus = ApprovalStatus.InProgress;
      nextLevel = currentLevel - 1;
    }
    task.status = nextStatus;
    task.nextReviewLevel = nextLevel;

    // Record history (include comment)
    const historyEntry = {
      reviewerId,
      reviewerRoles,
      actionType: 'reject',
      comment,
      currentLevel,
      nextLevel,
      currentStatus,
      nextStatus,
      timestamp: new Date().toISOString(),
    };
    if (!task.actionHistory) {
      task.actionHistory = [];
    }
    task.actionHistory.push(historyEntry);

    // Save
    await taskRepo.save(task);

    // Reload + add nextReviewRoles
    const updatedTask = await taskRepo.findOne({
      where: { id },
      relations: ['workflow', 'workflow.approvals'],
    });

    logger.info(req, 'ApprovalTask rejected', { taskId: id, reviewerId, level: currentLevel });
    const responseData = updatedTask || task;
    res.json({
      ...responseData,
      nextReviewRoles: getNextReviewRoles(responseData),
    });
  } catch (error: any) {
    logger.error(req, 'Failed to reject ApprovalTask', { error: error.message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else if (error instanceof CustomAuthError) {
      return res.status(error.errorCode).json({ error: 'Forbidden: access denied to resource' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Discard handler (bulk)
export const discardApprovalTasksHandler = async (req: any, res: any) => {
  try {
    const validated = discardTasksSchema.parse(req.body);
    const { taskIds, reviewerId, reviewerRoles, comment } = validated;

    const taskRepo = AppDataSource.getRepository(ApprovalTask);

    // Precise types (no any)
    type TaskWithRoles = ApprovalTask & { nextReviewRoles: string[] };
    interface DiscardError { taskId: string; error: string; }
    const results = { discarded: [] as TaskWithRoles[], errors: [] as DiscardError[] };

    // Single DB call: fetch ALL tasks + relations upfront (minimizes calls)
    const tasks = await taskRepo.find({
      where: { id: In(taskIds) },
      relations: ['workflow', 'workflow.approvals'],
    });
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    // Process each (in-memory; collect updates)
    const updatedTasks: ApprovalTask[] = [];
    for (const id of taskIds) {
      try {
        const task = taskMap.get(id);
        if (!task) {
          results.errors.push({ taskId: id, error: 'ApprovalTask not found' });
          continue;
        }

        // Enforce ownership per task
        enforceClientOwnership(req, task.workflow.ownerType, task.workflow.ownerId);

        // Skip if already terminal
        if ([ApprovalStatus.Completed, ApprovalStatus.Rejected, ApprovalStatus.Discarded].includes(task.status)) {
          results.errors.push({ taskId: id, error: 'Task already in terminal state' });
          continue;
        }

        // Optional role check (for consistency; skip if no current level)
        // Type matches find() return; if-guard narrows away undefined (use ! for strict TS)
        let currentApproval: WorkflowApprovals | undefined;
        if (task.nextReviewLevel) {
          currentApproval = task.workflow.approvals.find((a: any) => a.level === task.nextReviewLevel);
          if (currentApproval) {
            const roleMatch = reviewerRoles.some((role: string) => currentApproval!.allowedRoles.includes(role));
            if (!roleMatch) {
              results.errors.push({ taskId: id, error: `Insufficient permissions. Current level requires one of: ${currentApproval!.allowedRoles.join(', ')}` });
              continue;
            }
          }
        }

        // Discard: set Discarded, null level
        const currentLevel = task.nextReviewLevel || 0;
        const currentStatus = task.status;
        const nextLevel = null;
        const nextStatus = ApprovalStatus.Discarded;
        task.status = nextStatus;
        task.nextReviewLevel = nextLevel;

        // Record history per task
        const historyEntry = {
          reviewerId,
          reviewerRoles,
          actionType: 'discard',
          comment,  // optional
          currentLevel,
          nextLevel,
          currentStatus,
          nextStatus,
          timestamp: new Date().toISOString(),
        };
        if (!task.actionHistory) task.actionHistory = [];
        task.actionHistory.push(historyEntry);

        updatedTasks.push(task);  // Collect for batch/parallel update
      } catch (taskError: any) {
        results.errors.push({ taskId: id, error: taskError.message || 'Discard failed' });
      }
    }

    // Parallel updates (Promise.all for concurrent saves; same # calls but min latency)
    await Promise.all(updatedTasks.map(task => taskRepo.save(task)));

    // Batch reload successes (one query for relations/history in response)
    if (updatedTasks.length > 0) {
      const successIds = updatedTasks.map(t => t.id);
      const reloaded = await taskRepo.find({
        where: { id: In(successIds) },
        relations: ['workflow', 'workflow.approvals'],
      });
      const reloadedMap = new Map(reloaded.map(t => [t.id, t]));
      for (const task of updatedTasks) {
        const responseData = reloadedMap.get(task.id) || task;
        results.discarded.push({
          ...responseData,
          nextReviewRoles: getNextReviewRoles(responseData),
        });
      }
    }

    logger.info(req, 'Bulk discard completed', { taskIds, successCount: results.discarded.length, errorCount: results.errors.length });
    res.json(results);
  } catch (error: any) {
    logger.error(req, 'Failed to discard ApprovalTasks', { error: error.message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else if (error instanceof CustomAuthError) {
      return res.status(error.errorCode).json({ error: 'Forbidden: access denied to resource' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Bulk create handler: creates multiple tasks for one workflow + resourceIds array (reuses single-create logic)
export const bulkCreateApprovalTasksHandler = async (req: any, res: any) => {
  try {
    const validated = bulkCreateTasksSchema.parse(req.body);
    const { workflowId, resourceIds } = validated;

    const taskRepo = AppDataSource.getRepository(ApprovalTask);
    const workflowRepo = AppDataSource.getRepository(Workflow);

    // Validate workflow once (enabled + ownership)
    const workflow = await workflowRepo.findOneBy({
      id: workflowId,
      enabled: true,
      ownerType: req.clientType,
      ownerId: req.clientId,
    });
    if (!workflow) {
      return res.status(400).json({ error: 'Workflow not found or not enabled' });
    }

    // Batch create: pre-gen IDs, one save() call, one find with relations
    const tasksToSave = [];
    const taskIds = [];
    for (const resourceId of resourceIds) {
      const taskId = randomUUID();
      taskIds.push(taskId);
      tasksToSave.push(taskRepo.create({
        id: taskId,
        workflowId,
        resourceId,
        status: ApprovalStatus.Pending,
        nextReviewLevel: 1,
        actionHistory: [],
      }));
    }

    await taskRepo.save(tasksToSave);  // Single DB call for all

    // Reload all with relations (one query)
    const savedTasks = await taskRepo.find({
      where: { id: In(taskIds) },
      relations: ['workflow', 'workflow.approvals'],
    });

    // Map with computed nextReviewRoles
    const createdTasks = savedTasks.map(task => ({
      ...task,
      nextReviewRoles: getNextReviewRoles(task),
    }));

    logger.info(req, 'Bulk ApprovalTasks created', { workflowId, count: createdTasks.length });
    res.status(201).json({ data: createdTasks });
  } catch (error: any) {
    logger.error(req, 'Failed to bulk create ApprovalTasks', { error: error.message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};
