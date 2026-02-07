import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddEnabledColumnMigration implements MigrationInterface {
  name = 'AddEnabledColumnMigration';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'registered_webhook',
      new TableColumn({
        name: 'enabled',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('registered_webhook', 'enabled');
  }
}
