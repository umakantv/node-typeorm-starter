import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class InitialMigration implements MigrationInterface {
  name = 'InitialMigration';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create Workflow table
    await queryRunner.createTable(
      new Table({
        name: 'workflow',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'name',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'resourceType',
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
            name: 'enabled',
            type: 'boolean',
            isNullable: false,
            default: true,
          }),
          new TableColumn({
            name: 'createdAt',
            type: 'timestamp',
            isNullable: false,
            default: 'now()',
          }),
        ],
      }),
      true,
    );

    // Create WorkflowApprovals table
    await queryRunner.createTable(
      new Table({
        name: 'workflow_approvals',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'name',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'workflowId',
            type: 'uuid',
            isNullable: false,
          }),
          new TableColumn({
            name: 'level',
            type: 'integer',
            isNullable: false,
            default: 1,
          }),
          new TableColumn({
            name: 'allowedRoles',
            type: 'json',
            isNullable: false,
          }),
          new TableColumn({
            name: 'approvalCountsRequired',
            type: 'integer',
            isNullable: false,
            default: 1,
          }),
          new TableColumn({
            name: 'createdAt',
            type: 'timestamp',
            isNullable: false,
            default: 'now()',
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['workflowId'],
            referencedTableName: 'workflow',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
      true,
    );

    // Create ApprovalTask table
    await queryRunner.createTable(
      new Table({
        name: 'approval_task',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'workflowId',
            type: 'uuid',
            isNullable: false,
          }),
          new TableColumn({
            name: 'resourceId',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'status',
            type: 'varchar',
            isNullable: false,
            default: 'Pending',
          }),
          new TableColumn({
            name: 'nextReviewLevel',
            type: 'integer',
            isNullable: true,
          }),
          new TableColumn({
            name: 'createdAt',
            type: 'timestamp',
            isNullable: false,
            default: 'now()',
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['workflowId'],
            referencedTableName: 'workflow',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('approval_task');
    await queryRunner.dropTable('workflow_approvals');
    await queryRunner.dropTable('workflow');
  }
}
