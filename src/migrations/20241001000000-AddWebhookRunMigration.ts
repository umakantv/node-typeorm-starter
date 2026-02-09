import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AddWebhookRunMigration implements MigrationInterface {
  name = 'AddWebhookRunMigration';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'webhook_run',
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
            name: 'resourceId',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'resourceType',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'content',
            type: 'json',
            isNullable: false,
          }),
          new TableColumn({
            name: 'triggeredAt',
            type: 'datetime',
            isNullable: false,
          }),
          new TableColumn({
            name: 'triggeredBy',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'completedAt',
            type: 'datetime',
            isNullable: true,
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('webhook_run');
  }
}
