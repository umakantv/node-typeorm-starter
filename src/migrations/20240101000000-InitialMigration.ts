import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class InitialMigration implements MigrationInterface {
  name = 'InitialMigration';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'registered_webhook',
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
            name: 'resourceType',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'resourceId',
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
            name: 'connectionTimeout',
            type: 'integer',
            isNullable: false,
          }),
          new TableColumn({
            name: 'requestTimeout',
            type: 'integer',
            isNullable: false,
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('registered_webhook');
  }
}
