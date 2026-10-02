import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { OptionalUserGuard, type MaybeAuthedRequest } from '../auth/optional-user.guard.js';
import { FlightDealsService } from './flight-deals.service.js';

@Controller()
export class FlightDealsController {
  constructor(private readonly deals: FlightDealsService) {}

  @Get('flight-deals')
  @UseGuards(OptionalUserGuard)
  list(@Query('origin') origin?: string, @Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 20;
    const safe = Number.isFinite(parsed) ? Math.min(Math.max(Math.round(parsed), 1), 50) : 20;
    return this.deals.listPublic(origin, safe);
  }

  @Get('flight-deals/:id')
  @UseGuards(OptionalUserGuard)
  get(@Param('id') id: string) {
    return this.deals.getPublic(id);
  }

  @Post('flight-deals/:id/events')
  @UseGuards(OptionalUserGuard)
  event(@Param('id') id: string, @Req() request: MaybeAuthedRequest, @Body() body: unknown) {
    return this.deals.recordEvent(id, request.user, body);
  }

  @Get('r/flight-deals/:id/book')
  @UseGuards(OptionalUserGuard)
  book(@Param('id') id: string, @Req() request: MaybeAuthedRequest, @Res() response: Response) {
    const target = this.deals.bookRedirect(id, request.user);
    response.redirect(302, target);
  }
}
