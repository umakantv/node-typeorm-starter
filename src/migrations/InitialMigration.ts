import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class InitialMigration implements MigrationInterface {
  name = 'InitialMigration';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create User table
    await queryRunner.createTable(
      new Table({
        name: 'user',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            isNullable: false,
          }),
          new TableColumn({
            name: 'name',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'email',
            type: 'varchar',
            isUnique: true,
            isNullable: false,
          }),
        ],
      }),
      true,
    );

    // Create Post table
    await queryRunner.createTable(
      new Table({
        name: 'post',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            isNullable: false,
          }),
          new TableColumn({
            name: 'title',
            type: 'varchar',
            isNullable: false,
          }),
          new TableColumn({
            name: 'content',
            type: 'text',
            isNullable: false,
          }),
          new TableColumn({
            name: 'userId',
            type: 'integer',
            isNullable: false,
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['userId'],
            referencedTableName: 'user',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
      true,
    );

    // Create Comment table
    await queryRunner.createTable(
      new Table({
        name: 'comment',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            isNullable: false,
          }),
          new TableColumn({
            name: 'content',
            type: 'text',
            isNullable: false,
          }),
          new TableColumn({
            name: 'postId',
            type: 'integer',
            isNullable: false,
          }),
          new TableColumn({
            name: 'userId',
            type: 'integer',
            isNullable: false,
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['postId'],
            referencedTableName: 'post',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            columnNames: ['userId'],
            referencedTableName: 'user',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('comment');
    await queryRunner.dropTable('post');
    await queryRunner.dropTable('user');
  }
}
