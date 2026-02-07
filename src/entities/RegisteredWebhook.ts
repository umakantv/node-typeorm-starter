import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class RegisteredWebhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  resourceType: string;

  @Column()
  resourceId: string;

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

  @Column({ type: 'int' })
  connectionTimeout: number;

  @Column({ type: 'int' })
  requestTimeout: number;

  @Column({ default: true })
  enabled: boolean;
}
