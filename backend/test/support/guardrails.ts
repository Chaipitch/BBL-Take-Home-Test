import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';

interface RouteArg {
  index: number;
  data?: unknown;
  pipes?: unknown[];
  schema?: unknown;
}

/**
 * ADR-013f: returns a violation for every @Body/@Query without a schema (Nest's schema pipe would
 * silently skip it), every property-level @Body('x')/@Query('x') (bypasses strict whole-object
 * validation), and every @Param without a pipe.
 */
export function findUnvalidatedParams(controller: new (...args: never[]) => unknown): string[] {
  const violations: string[] = [];
  const proto = controller.prototype as Record<string, unknown>;
  for (const method of Object.getOwnPropertyNames(proto)) {
    if (method === 'constructor') continue;
    const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ?? {}) as Record<string, RouteArg>;
    for (const [key, arg] of Object.entries(args)) {
      const paramtype = Number(key.split(':')[0]);
      const where = `${controller.name}.${method} arg #${arg.index}`;
      if (paramtype === RouteParamtypes.BODY || paramtype === RouteParamtypes.QUERY) {
        const kind = paramtype === RouteParamtypes.BODY ? 'body' : 'query';
        if (!arg.schema) violations.push(`${where}: ${kind} without a schema`);
        if (arg.data !== undefined) violations.push(`${where}: property-level ${kind} (${JSON.stringify(arg.data)})`);
      }
      if (paramtype === RouteParamtypes.PARAM && (arg.pipes ?? []).length === 0) {
        violations.push(`${where}: path param without a pipe`);
      }
    }
  }
  return violations;
}
