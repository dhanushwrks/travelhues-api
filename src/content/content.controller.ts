import { Controller, Get, Param } from '@nestjs/common';
import { ContentService } from './content.service.js';

@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('settings')
  getPublicSettings() {
    return this.content.getPublicSettings();
  }

  @Get('stories')
  getStories() {
    return this.content.getStories();
  }

  @Get('stories/:slug')
  getStory(@Param('slug') slug: string) {
    return this.content.getStory(slug);
  }

  @Get('stories/:slug/itineraries/:itinerarySlug')
  getItinerary(
    @Param('slug') slug: string,
    @Param('itinerarySlug') itinerarySlug: string,
  ) {
    return this.content.getItinerary(slug, itinerarySlug);
  }

  @Get('creators/:username')
  getCreator(@Param('username') username: string) {
    return this.content.getCreator(username);
  }
}
