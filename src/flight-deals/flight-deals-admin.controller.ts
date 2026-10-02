import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard.js';
import { FlightDealsService } from './flight-deals.service.js';

@Controller('admin/flight-deals')
@UseGuards(AdminGuard)
export class FlightDealsAdminController {
  constructor(private readonly deals: FlightDealsService) {}

  @Get()
  list(@Query('origin') origin?: string, @Query('status') status?: string) {
    return this.deals.adminList({ origin, status });
  }

  @Get('analytics')
  analytics() {
    return this.deals.analytics();
  }

  @Get('story-suggestions')
  suggestions(
    @Query('destinationCity') destinationCity?: string,
    @Query('country') country?: string,
  ) {
    return this.deals.storySuggestions(destinationCity ?? '', country ?? '');
  }

  @Post()
  create(@Body() body: unknown) {
    return this.deals.adminCreate(body);
  }

  @Post('import')
  importRows(@Body() body: unknown) {
    return this.deals.adminImport(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.deals.adminUpdate(id, body);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.deals.adminArchive(id);
  }
}
