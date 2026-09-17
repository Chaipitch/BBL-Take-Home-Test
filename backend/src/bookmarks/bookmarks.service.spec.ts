// ADR-014c: the race where a collection is deleted between the app check and the write can't be
// produced deterministically end to end, so the error mapping is tested with stubbed Prisma errors
// shaped like the real ones (captured from Postgres via the pg adapter on 2026-09-17).
import { NotFoundException } from '@nestjs/common';
import { ValidationFailedException } from '../common/errors.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { BookmarksService, isCollectionFkViolation } from './bookmarks.service.js';

const fkError = (index: string) =>
  new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated', {
    code: 'P2003',
    clientVersion: '7.10.0',
    meta: { modelName: 'Bookmark', driverAdapterError: { name: 'DriverAdapterError', cause: { originalCode: '23503', kind: 'ForeignKeyConstraintViolation', constraint: { index } } } },
  });
const notFound = () => new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: '7.10.0' });

function serviceWith(writeError: unknown) {
  const fail = () => Promise.reject(writeError);
  const prisma = {
    collection: { findUnique: () => Promise.resolve({ id: 'exists-at-check-time' }) },
    bookmark: { create: fail, update: fail, delete: fail },
  } as unknown as PrismaService;
  return new BookmarksService(prisma);
}

const body = { url: 'https://example.com', title: 't', collectionId: '00000000-0000-4000-8000-000000000001' };

describe('BookmarksService write error mapping', () => {
  it.each([
    ['create', (s: BookmarksService) => s.create('owner', body)],
    ['replace', (s: BookmarksService) => s.replace('owner', 'id', body)],
    ['patch', (s: BookmarksService) => s.patch('owner', 'id', { collectionId: body.collectionId })],
  ])('%s: collection FK violation after a passing check → 400 collectionId (not 500)', async (_label, call) => {
    const err = await call(serviceWith(fkError('Bookmark_collectionId_ownerId_fkey'))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationFailedException);
    expect((err as ValidationFailedException).errors).toEqual([{ field: 'collectionId', message: 'collection not found' }]);
  });

  it('a different FK violation is not mislabelled as collectionId', async () => {
    const err = await serviceWith(fkError('Bookmark_ownerId_fkey')).create('owner', body).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ValidationFailedException);
    expect(isCollectionFkViolation(err)).toBe(false);
  });

  it.each([
    ['patch', (s: BookmarksService) => s.patch('owner', 'id', { title: 'x' })],
    ['delete', (s: BookmarksService) => s.delete('owner', 'id')],
  ])('%s: P2025 → 404', async (_label, call) => {
    await expect(call(serviceWith(notFound()))).rejects.toBeInstanceOf(NotFoundException);
  });
});
