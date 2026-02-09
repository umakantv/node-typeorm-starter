import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class WebhookExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  webhookRunId: string;

  @Column()
  webhookId: string;

  @Column()
  ownerType: string;

  @Column()
  ownerId: string;

  @Column()
  webhookType: string;

  @Column()
  webhookUrl: string;

  @Column({ type: 'json', nullable: true })
  headers: Record<string, any> | null;

  @Column()
  result: 'success' | 'failure';

  @Column({ type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ type: 'text', nullable: true })
  response: string | null;

  @Column({ type: 'datetime' })
  startedAt: Date;

  @Column({ type: 'datetime' })
  endedAt: Date;
}
