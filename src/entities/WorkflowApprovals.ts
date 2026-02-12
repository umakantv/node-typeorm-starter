import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Workflow } from './Workflow';

@Entity('workflow_approvals')
export class WorkflowApprovals {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  workflowId: string;

  @ManyToOne(() => Workflow, (workflow) => workflow.approvals, { onDelete: 'CASCADE' })
  workflow: Workflow;

  @Column({ type: 'integer', default: 1 })
  level: number;

  @Column('json')
  allowedRoles: string[];

  @Column({ type: 'integer', default: 1 })
  approvalCountsRequired: number;

  @CreateDateColumn()
  createdAt: Date;
}
