import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TccGuard } from '../auth/tcc.guard.js';
import { OptionalUserGuard, type MaybeAuthedRequest } from '../auth/optional-user.guard.js';
import { UserGuard, type AuthedRequest } from '../auth/user.guard.js';
import { GlimpsesService } from './glimpses.service.js';

@Controller('glimpses')
export class GlimpsesController {
  constructor(private readonly glimpses: GlimpsesService) {}

  @Get()
  @UseGuards(OptionalUserGuard)
  list(@Req() request: MaybeAuthedRequest, @Query('country') country?: string) {
    return this.glimpses.list(request.user?.id ?? '', country);
  }

  @Post()
  @UseGuards(UserGuard, TccGuard)
  create(@Req() request: AuthedRequest, @Body() body: unknown) {
    return this.glimpses.create(request.user, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(UserGuard)
  async remove(@Req() request: AuthedRequest, @Param('id') id: string) {
    await this.glimpses.remove(request.user, id);
  }

  @Post(':id/like')
  @UseGuards(UserGuard)
  like(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.glimpses.toggleLike(request.user, id);
  }

  @Post(':id/comments')
  @UseGuards(UserGuard)
  comment(@Req() request: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.glimpses.comment(request.user, id, body);
  }
}
