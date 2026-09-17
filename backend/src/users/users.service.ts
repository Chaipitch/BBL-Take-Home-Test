import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** GET /me body (ADR-011g). */
export interface MeResponse {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** The guard guarantees the row exists for the authenticated user. */
  getMe(userId: string): Promise<MeResponse> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true, name: true },
    });
  }
}
