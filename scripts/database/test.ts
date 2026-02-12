import { AppDataSource } from '../../src/database';
import { Workflow } from '../../src/entities/Workflow';
import { WorkflowApprovals } from '../../src/entities/WorkflowApprovals';
import * as crypto from 'crypto';

async function testDatabase() {
  try {
    // Ensure DB initialized (for standalone script)
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const workflowRepo = AppDataSource.getRepository(Workflow);
    const approvalsRepo = AppDataSource.getRepository(WorkflowApprovals);

    // Clear existing data for clean test
    await approvalsRepo.clear();
    await workflowRepo.clear();

    console.log('Testing inserts for Workflow, WorkflowApprovals...');

    // Insert Workflow (id pre-generated as UUID)
    const workflowId = crypto.randomUUID();
    const workflow = workflowRepo.create({
      id: workflowId,
      name: 'Demo Workflow',
      resourceType: 'project',
      ownerType: 'user',
      ownerId: 'user-456',
      enabled: true,
    });
    await workflowRepo.save(workflow);
    console.log('Inserted Workflow:', workflow);

    // Insert WorkflowApprovals
    const approval = approvalsRepo.create({
      id: crypto.randomUUID(),
      name: 'Demo Approval Level 1',
      workflowId,
      level: 1,
      allowedRoles: ['admin', 'approver'],
      approvalCountsRequired: 1,
    });
    await approvalsRepo.save(approval);
    console.log('Inserted WorkflowApprovals:', approval);

    // Read back
    const workflows = await workflowRepo.find();
    const approvals = await approvalsRepo.find();
    console.log('Read Workflows:', JSON.stringify(workflows, null, 2));
    console.log('Read WorkflowApprovals:', JSON.stringify(approvals, null, 2));

    console.log('All tests passed successfully!');
  } catch (error) {
    console.error('Database test failed:', error);
  } finally {
    // Close connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// Run test
testDatabase();
