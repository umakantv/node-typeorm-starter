import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Workflow } from './Workflow';

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

  @ManyToOne(() => Workflow, { nullable: false })
  @JoinColumn({ name: 'workflowId' })
  workflow: Workflow;
}
