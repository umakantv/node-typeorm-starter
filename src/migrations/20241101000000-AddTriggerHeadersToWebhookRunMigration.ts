import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTriggerHeadersToWebhookRunMigration implements MigrationInterface {
  name = 'AddTriggerHeadersToWebhookRunMigration';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'webhook_run',
      new TableColumn({
        name: 'headers',
        type: 'json',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('webhook_run', 'headers');
  }
}
