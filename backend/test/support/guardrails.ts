import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
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

export interface RouteInfo {
  controller: string;
  handler: string;
  method: string;
  path: string;
}

/** Every HTTP route of a controller, from Nest's @Controller/@Get/... metadata (ADR-017). */
export function listRoutes(controller: new (...args: never[]) => unknown): RouteInfo[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor' && Reflect.getMetadata(PATH_METADATA, proto[name] as object) !== undefined)
    .map((name) => {
      const handler = proto[name] as object;
      const sub = String(Reflect.getMetadata(PATH_METADATA, handler));
      const path = `/${[base, sub].map((p) => p.replace(/^\/|\/$/g, '')).filter(Boolean).join('/')}`;
      return { controller: controller.name, handler: name, method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number], path };
    });
}
