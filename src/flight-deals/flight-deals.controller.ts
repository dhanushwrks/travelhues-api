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
  list(
    @Query('origin') origin?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sort') sort?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : 20;
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.round(parsedLimit), 1), 50)
      : 20;
    const parsedOffset = offset ? Number(offset) : 0;
    const safeOffset = Number.isFinite(parsedOffset) ? Math.max(Math.round(parsedOffset), 0) : 0;
    const safeSort =
      sort === 'latest' || sort === 'offer' || sort === 'featured' ? sort : 'featured';
    return this.deals.listPublic(origin, safeLimit, safeOffset, safeSort);
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
