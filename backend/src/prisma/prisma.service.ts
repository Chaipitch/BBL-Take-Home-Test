import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    // ADR-011h: required configuration; the app refuses to start without it.
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error('Missing required configuration: DATABASE_URL');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
