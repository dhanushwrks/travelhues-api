import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthedRequest } from './user.guard.js';

@Injectable()
export class TccGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (request.user?.role !== 'tcc') {
      throw new ForbiddenException('Only a creator can add a story');
    }
    return true;
  }
}
