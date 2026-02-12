import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

export enum ApprovalStatus {
  Pending = 'Pending',
  InProgress = 'InProgress',
  Completed = 'Completed',
  Rejected = 'Rejected',
}

@Entity()
export class ApprovalTask {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  workflowId: string;

  @Column()
  resourceId: string;

  @Column({
    type: 'varchar',
    default: ApprovalStatus.Pending,
  })
  status: ApprovalStatus;

  @Column({ type: 'integer', nullable: true })
  nextReviewLevel: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
