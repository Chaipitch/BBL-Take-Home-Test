import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { InvalidTokenError } from './token-verifier.js';
import { UserInfoClient, type UserInfoClaims } from './userinfo.client.js';

/** What controllers receive via @CurrentUser() (ADR-011b). `id` is the ownerId for all data. */
export interface AuthenticatedUser {
  id: string;
  sub: string;
}

export interface Profile {
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export const PROFILE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // ADR-009

/**
 * ADR-011f: email trimmed + lower-cased; verified only if Auth0 says exactly `true` and an email
 * exists; picture/nickname and anything else are deliberately not kept.
 */
export function toProfile(claims: UserInfoClaims): Profile {
  const email = typeof claims.email === 'string' && claims.email.trim() !== '' ? claims.email.trim().toLowerCase() : null;
  const name = typeof claims.name === 'string' && claims.name.trim() !== '' ? claims.name.trim() : null;
  return { email, emailVerified: email !== null && claims.email_verified === true, name };
}

/**
 * Maps a verified token to a User row, creating it on first sight and syncing the profile from
 * /userinfo when it has never synced or is older than 24 h (ADR-007, ADR-009, ADR-011).
 */
@Injectable()
export class UserProvisioner {
  private readonly logger = new Logger(UserProvisioner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userInfo: UserInfoClient,
  ) {}

  async resolve(sub: string, accessToken: string): Promise<AuthenticatedUser> {
    const existing = await this.prisma.user.findUnique({
      where: { auth0Sub: sub },
      select: { id: true, profileSyncedAt: true },
    });

    if (existing?.profileSyncedAt && Date.now() - existing.profileSyncedAt.getTime() < PROFILE_MAX_AGE_MS) {
      return { id: existing.id, sub };
    }

    const result = await this.userInfo.fetch(accessToken);

    switch (result.kind) {
      case 'unauthorized':
        // ADR-011e: Auth0 no longer honours this token; nothing is created or changed.
        throw new InvalidTokenError('userinfo_unauthorized');

      case 'unavailable': {
        if (existing) {
          // Stale refresh failed: keep stored profile, leave profileSyncedAt so the next request retries.
          this.logger.warn(`profile refresh failed, keeping stored profile: ${result.reason}`);
          return { id: existing.id, sub };
        }
        // First sign-in without /userinfo: create the user with no email (sharing to them is impossible
        // until a verified email is synced, so this fails safe). profileSyncedAt stays null → retried.
        this.logger.warn(`first profile sync failed, creating user without profile: ${result.reason}`);
        const created = await this.prisma.user.upsert({
          where: { auth0Sub: sub },
          create: { auth0Sub: sub },
          // Must not be `{}`: with an empty update Prisma 7.10 runs SELECT-then-INSERT instead of a
          // native INSERT … ON CONFLICT, and parallel first requests fail with P2002 (measured:
          // 171/200). A same-value write keeps it a single atomic statement.
          update: { auth0Sub: sub },
          select: { id: true },
        });
        return { id: created.id, sub };
      }

      case 'ok': {
        if (result.claims.sub !== sub) {
          this.logger.error('userinfo sub does not match the verified token sub; refusing to store profile');
          throw new InvalidTokenError('userinfo_sub_mismatch');
        }
        const profile = toProfile(result.claims);
        const now = new Date();
        const user = await this.prisma.user.upsert({
          where: { auth0Sub: sub },
          create: { auth0Sub: sub, ...profile, profileSyncedAt: now },
          update: { ...profile, profileSyncedAt: now },
          select: { id: true },
        });
        return { id: user.id, sub };
      }
    }
  }
}
