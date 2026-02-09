import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AddScheduleMigration implements MigrationInterface {
  name = 'AddScheduleMigration';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'schedule',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'webhookId',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'frequency',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'content',
            type: 'json',
            isNullable: false,
          }),
          new TableColumn({
            name: 'enabled',
            type: 'boolean',
            isNullable: false,
            default: true,
          }),
          new TableColumn({
            name: 'endAt',
            type: 'datetime',
            isNullable: true,
          }),
          new TableColumn({
            name: 'triggeredBy',
            type: 'varchar',
            isNullable: true,
          }),
          new TableColumn({
            name: 'nextRunAt',
            type: 'datetime',
            isNullable: false,
          }),
          new TableColumn({
            name: 'lastRunAt',
            type: 'datetime',
            isNullable: true,
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('schedule');
  }
}
