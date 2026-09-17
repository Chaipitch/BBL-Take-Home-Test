import { HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';

/** Path `:id` as a UUID. A malformed id is a 404, identical to not-found / not-yours (ADR-004a). */
export const IdParam = () => Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }));
