import { HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';

/** A path UUID (default `:id`). A malformed id is a 404, identical to not-found / not-yours (ADR-004a). */
export const IdParam = (name = 'id') => Param(name, new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }));
