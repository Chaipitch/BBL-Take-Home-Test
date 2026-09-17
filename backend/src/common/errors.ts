import { BadRequestException, ConflictException } from '@nestjs/common';

export interface FieldError {
  field: string;
  message: string;
}

/** 400 validation_failed with a field list (API_DESIGN §2). */
export class ValidationFailedException extends BadRequestException {
  constructor(readonly errors: FieldError[]) {
    super('Request validation failed');
  }
}

/** 409 collection_not_empty (ADR-005b). */
export class CollectionNotEmptyException extends ConflictException {
  constructor(readonly bookmarkCount: number) {
    super('Collection has bookmarks; repeat with ?confirm=true to delete them too');
  }
}
