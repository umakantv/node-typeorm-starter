import { Entity, PrimaryColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { WorkflowApprovals } from './WorkflowApprovals';

@Entity('workflow')
export class Workflow {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  resourceType: string;

  @Column()
  ownerType: string;

  @Column()
  ownerId: string;

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => WorkflowApprovals, (approval: any) => approval.workflow, { cascade: true })
  approvals: WorkflowApprovals[];
}
