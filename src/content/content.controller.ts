import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { publicJsonCacheHeader } from '../http/public-cache.js';
import { AdminService } from '../admin/admin.service.js';
import { OptionalUserGuard, type MaybeAuthedRequest } from '../auth/optional-user.guard.js';
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
  @UseGuards(UserGuard)
  myStories(@Req() request: AuthedRequest) {
    return this.admin.storiesFor(request.user);
  }

  @Post('stories')
  @UseGuards(UserGuard)
  createStory(@Req() request: AuthedRequest, @Body() body: unknown) {
    return this.admin.createStoryForCreator(request.user, body);
  }

  @Put('stories/:slug')
  @UseGuards(UserGuard)
  updateStory(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.updateStory(slug, body);
  }

  @Post('stories/:slug/spots')
  @UseGuards(UserGuard)
  createSpot(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.createSpot(slug, body);
  }

  @Put('stories/:slug/spots/:spotId')
  @UseGuards(UserGuard)
  updateSpot(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Param('spotId') spotId: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.updateSpot(slug, spotId, body);
  }

  @Post('stories/:slug/blogs')
  @UseGuards(UserGuard, TccGuard)
  createBlog(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.createBlog(slug, body);
  }

  @Put('stories/:slug/blogs/:blogSlug')
  @UseGuards(UserGuard, TccGuard)
  updateBlog(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Param('blogSlug') blogSlug: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.updateBlog(slug, blogSlug, body);
  }

  @Post('stories/:slug/itineraries')
  @UseGuards(UserGuard)
  createItinerary(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.createItinerary(slug, body);
  }

  @Put('stories/:slug/itineraries/:itinerarySlug')
  @UseGuards(UserGuard)
  updateItinerary(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Param('itinerarySlug') itinerarySlug: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.updateItinerary(slug, itinerarySlug, body);
  }

  @Post('stories/:slug/archive')
  @UseGuards(UserGuard)
  archiveStory(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.setStoryArchived(slug, archivedFlag(body));
  }

  @Post('stories/:slug/spots/:spotId/archive')
  @UseGuards(UserGuard)
  archiveSpot(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Param('spotId') spotId: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.setSpotArchived(slug, spotId, archivedFlag(body));
  }

  @Post('stories/:slug/blogs/:blogSlug/archive')
  @UseGuards(UserGuard, TccGuard)
  archiveBlog(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Param('blogSlug') blogSlug: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.setBlogArchived(slug, blogSlug, archivedFlag(body));
  }

  @Post('stories/:slug/itineraries/:itinerarySlug/archive')
  @UseGuards(UserGuard)
  archiveItinerary(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Param('itinerarySlug') itinerarySlug: string,
    @Body() body: unknown,
  ) {
    this.admin.requireOwned(request.user, slug);
    return this.admin.setItineraryArchived(slug, itinerarySlug, archivedFlag(body));
  }

  @Get('settings')
  @Header('Cache-Control', publicJsonCacheHeader)
  getPublicSettings() {
    return this.content.getPublicSettings();
  }

  @Get('spot-catalog')
  @Header('Cache-Control', publicJsonCacheHeader)
  spotCatalog() {
    return this.admin.catalog();
  }

  @Get('search')
  search(
    @Query('q') q = '',
    @Query('kind') kind = '',
    @Query('country') country = '',
    @Query('spot') spot = '',
    @Query('sort') sort = '',
    @Query('page') page = '',
    @Query('limit') limit = '',
  ) {
    return this.content.search({ q, kind, country, spot, sort, page, limit });
  }

  @Get('stories')
  @UseGuards(OptionalUserGuard)
  getStories(@Req() request: MaybeAuthedRequest) {
    return this.content.getStories(request.user?.id);
  }

  @Get('stories/:slug')
  @UseGuards(OptionalUserGuard)
  getStory(@Req() request: MaybeAuthedRequest, @Param('slug') slug: string) {
    return this.content.getStory(slug, request.user?.id);
  }

  @Get('stories/:slug/itineraries/:itinerarySlug')
  @UseGuards(UserGuard)
  getItinerary(
    @Req() request: AuthedRequest,
    @Param('slug') slug: string,
    @Param('itinerarySlug') itinerarySlug: string,
  ) {
    return this.content.getItinerary(slug, itinerarySlug, request.user.id);
  }

  @Get('destinations')
  listDestinations(@Query('country') country = '', @Query('limit') limit = '') {
    return this.content.listDestinations({ country, limit });
  }

  @Get('creators')
  listCreators(
    @Query('q') q = '',
    @Query('country') country = '',
    @Query('page') page = '',
    @Query('limit') limit = '',
  ) {
    return this.content.listCreators({ q, country, page, limit });
  }

  @Get('creators/:username')
  @UseGuards(OptionalUserGuard)
  getCreator(@Req() request: MaybeAuthedRequest, @Param('username') username: string) {
    return this.content.getCreator(username, request.user?.id);
  }
}

function archivedFlag(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return true;
  return (body as { archived?: unknown }).archived !== false;
}
