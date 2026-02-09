import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity()
export class WebhookRun {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  resourceId: string;

  @Column()
  resourceType: string;

  @Column({ type: 'json' })
  content: Record<string, any>;

  @Column({ type: 'datetime' })
  triggeredAt: Date;

  @Column()
  triggeredBy: string;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;
}
