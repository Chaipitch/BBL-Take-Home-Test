import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

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

/** 404 recipient_not_found: no user with that email and a verified email (ADR-006c). */
export class RecipientNotFoundException extends NotFoundException {}

/** 409 ambiguous_recipient: more than one verified user has that email (ADR-015c). */
export class AmbiguousRecipientException extends ConflictException {}

/** 409 already_shared (ADR-015c). */
export class AlreadySharedException extends ConflictException {}
