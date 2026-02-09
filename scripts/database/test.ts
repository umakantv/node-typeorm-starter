import { AppDataSource } from '../../src/database';
import { RegisteredWebhook } from '../../src/entities/RegisteredWebhook';
import { WebhookRun } from '../../src/entities/WebhookRun';
import { WebhookExecution } from '../../src/entities/WebhookExecution';
import { randomUUID } from 'crypto';

async function testDatabase() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const webhookRepo = AppDataSource.getRepository(RegisteredWebhook);
    const runRepo = AppDataSource.getRepository(WebhookRun);
    const execRepo = AppDataSource.getRepository(WebhookExecution);

    await webhookRepo.clear();
    await runRepo.clear();
    await execRepo.clear();

    console.log('Testing inserts for RegisteredWebhook, WebhookRun and WebhookExecution...');

    const webhook = webhookRepo.create({
      resourceType: 'post',
      resourceId: '123',
      ownerType: 'user',
      ownerId: '456',
      webhookType: 'http',
      webhookUrl: 'https://example.com/webhook',
      headers: null,
      connectionTimeout: 5,
      requestTimeout: 10,
      enabled: true,
    });
    await webhookRepo.save(webhook);
    console.log('Inserted RegisteredWebhook:', webhook);

    const run = runRepo.create({
      id: randomUUID(),
      resourceId: '123',
      resourceType: 'post',
      content: { message: 'test event' },
      triggeredAt: new Date(),
      triggeredBy: 'service',
      completedAt: null,
    });
    await runRepo.save(run);
    console.log('Inserted WebhookRun:', run);

    const exec = execRepo.create({
      webhookRunId: run.id,
      webhookId: webhook.id,
      ownerType: 'user',
      ownerId: '456',
      webhookType: 'http',
      webhookUrl: 'https://example.com/webhook',
      headers: null,
      result: 'success',
      statusCode: 200,
      response: '{"status":"ok"}',
      startedAt: new Date(),
      endedAt: new Date(),
    });
    await execRepo.save(exec);
    console.log('Inserted WebhookExecution:', exec);

    const runs = await runRepo.find();
    console.log('Read WebhookRuns:', JSON.stringify(runs, null, 2));

    console.log('All tests passed successfully!');
  } catch (error) {
    console.error('Database test failed:', error);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// Run test
testDatabase();
