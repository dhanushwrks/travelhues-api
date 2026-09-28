import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AdminService } from '../admin/admin.service.js';
import { TccGuard } from '../auth/tcc.guard.js';
import { UserGuard, type AuthedRequest } from '../auth/user.guard.js';
import { ContentService } from './content.service.js';

@Controller()
export class ContentController {
  constructor(
    private readonly content: ContentService,
    private readonly admin: AdminService,
  ) {}

  @Get('me/stories')
  @UseGuards(UserGuard, TccGuard)
  myStories(@Req() request: AuthedRequest) {
    return this.admin.storiesFor(request.user);
  }

  @Post('stories')
  @UseGuards(UserGuard, TccGuard)
  createStory(@Req() request: AuthedRequest, @Body() body: unknown) {
    return this.admin.createStoryForCreator(request.user, body);
  }

  @Post('stories/:slug/spots')
  @UseGuards(UserGuard, TccGuard)
  createSpot(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.createSpot(slug, body);
  }

  @Post('stories/:slug/itineraries')
  @UseGuards(UserGuard, TccGuard)
  createItinerary(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.createItinerary(slug, body);
  }

  @Get('settings')
  getPublicSettings() {
    return this.content.getPublicSettings();
  }

  @Get('stories')
  @UseGuards(UserGuard)
  getStories() {
    return this.content.getStories();
  }

  @Get('stories/:slug')
  @UseGuards(UserGuard)
  getStory(@Param('slug') slug: string) {
    return this.content.getStory(slug);
  }

  @Get('stories/:slug/itineraries/:itinerarySlug')
  @UseGuards(UserGuard)
  getItinerary(
    @Param('slug') slug: string,
    @Param('itinerarySlug') itinerarySlug: string,
  ) {
    return this.content.getItinerary(slug, itinerarySlug);
  }

  @Get('creators/:username')
  @UseGuards(UserGuard)
  getCreator(@Param('username') username: string) {
    return this.content.getCreator(username);
  }
}
