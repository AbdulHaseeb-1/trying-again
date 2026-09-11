import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';

import { DeviceAuthService, type AgentPrincipal } from './device-auth.service';

export type AuthedRequest = Request & { principal?: AgentPrincipal };

/**
 * Applied to every agent and AI-settings endpoint without exception.
 *
 * Authorization is never inferred from the request body: the principal comes
 * from the signed token and nowhere else, so a client cannot ask for another
 * device's conversations by naming its user id.
 */
@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(private readonly auth: DeviceAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization ?? '';
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : undefined;

    const principal = this.auth.verify(token);
    if (!principal) {
      throw new UnauthorizedException('A valid device token is required.');
    }
    request.principal = principal;
    return true;
  }
}

/** `@Principal() principal: AgentPrincipal` in a controller signature. */
export const Principal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AgentPrincipal => {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.principal) throw new UnauthorizedException();
    return request.principal;
  },
);
