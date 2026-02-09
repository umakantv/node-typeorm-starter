import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity()
export class Schedule {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  webhookId: string;

  @Column()
  frequency: string;

  @Column({ type: 'json' })
  content: Record<string, any>;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'datetime', nullable: true })
  endAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  triggeredBy: string | null;

  @Column({ type: 'datetime' })
  nextRunAt: Date;

  @Column({ type: 'datetime', nullable: true })
  lastRunAt: Date | null;
}
