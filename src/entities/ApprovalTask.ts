import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Workflow } from './Workflow';

export enum ApprovalStatus {
  Pending = 'Pending',
  InProgress = 'InProgress',
  Completed = 'Completed',
  Rejected = 'Rejected',
  Discarded = 'Discarded',
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

  @Column({ type: 'json', nullable: true, default: '[]' })
  actionHistory: any[];

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Workflow, { nullable: false })
  @JoinColumn({ name: 'workflowId' })
  workflow: Workflow;
}
