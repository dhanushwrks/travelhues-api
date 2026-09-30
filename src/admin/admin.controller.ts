import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('settings')
  settings() {
    return this.admin.settings();
  }

  @Put('settings')
  saveSettings(@Body() body: unknown) {
    return this.admin.saveSettings(body);
  }

  @Get('spot-catalog')
  spotCatalog() {
    return this.admin.catalog();
  }

  @Put('spot-catalog')
  saveSpotCatalog(@Body() body: unknown) {
    return this.admin.saveCatalog(body);
  }

  @Get('stories')
  stories() {
    return this.admin.stories();
  }

  @Get('stories/:slug')
  story(@Param('slug') slug: string) {
    return this.admin.story(slug);
  }

  @Post('stories')
  createStory(@Body() body: unknown) {
    return this.admin.createStory(body);
  }

  @Put('stories/:slug')
  updateStory(@Param('slug') slug: string, @Body() body: unknown) {
    return this.admin.updateStory(slug, body);
  }

  @Delete('stories/:slug')
  @HttpCode(204)
  async deleteStory(@Param('slug') slug: string) {
    await this.admin.deleteStory(slug);
  }

  @Post('stories/:slug/spots')
  createSpot(@Param('slug') slug: string, @Body() body: unknown) {
    return this.admin.createSpot(slug, body);
  }

  @Post('stories/:slug/blogs')
  createBlog(@Param('slug') slug: string, @Body() body: unknown) {
    return this.admin.createBlog(slug, body);
  }

  @Put('stories/:slug/spots/:spotId')
  updateSpot(
    @Param('slug') slug: string,
    @Param('spotId') spotId: string,
    @Body() body: unknown,
  ) {
    return this.admin.updateSpot(slug, spotId, body);
  }

  @Delete('stories/:slug/spots/:spotId')
  @HttpCode(204)
  async deleteSpot(
    @Param('slug') slug: string,
    @Param('spotId') spotId: string,
  ) {
    await this.admin.deleteSpot(slug, spotId);
  }

  @Post('stories/:slug/itineraries')
  createItinerary(@Param('slug') slug: string, @Body() body: unknown) {
    return this.admin.createItinerary(slug, body);
  }

  @Put('stories/:slug/itineraries/:itinerarySlug')
  updateItinerary(
    @Param('slug') slug: string,
    @Param('itinerarySlug') itinerarySlug: string,
    @Body() body: unknown,
  ) {
    return this.admin.updateItinerary(slug, itinerarySlug, body);
  }

  @Delete('stories/:slug/itineraries/:itinerarySlug')
  @HttpCode(204)
  async deleteItinerary(
    @Param('slug') slug: string,
    @Param('itinerarySlug') itinerarySlug: string,
  ) {
    await this.admin.deleteItinerary(slug, itinerarySlug);
  }
}
