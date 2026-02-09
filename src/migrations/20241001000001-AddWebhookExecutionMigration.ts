import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AddWebhookExecutionMigration implements MigrationInterface {
  name = 'AddWebhookExecutionMigration';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'webhook_execution',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            isNullable: false,
          }),
          new TableColumn({
            name: 'webhookRunId',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'webhookId',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'ownerType',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'ownerId',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'webhookType',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'webhookUrl',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'headers',
            type: 'json',
            isNullable: true,
          }),
          new TableColumn({
            name: 'result',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'statusCode',
            type: 'integer',
            isNullable: true,
          }),
          new TableColumn({
            name: 'response',
            type: 'text',
            isNullable: true,
          }),
          new TableColumn({
            name: 'startedAt',
            type: 'datetime',
            isNullable: false,
          }),
          new TableColumn({
            name: 'endedAt',
            type: 'datetime',
            isNullable: false,
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('webhook_execution');
  }
}
