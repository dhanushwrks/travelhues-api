import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { UserGuard, type AuthedRequest } from '../auth/user.guard.js';
import { MarksService } from './marks.service.js';

@Controller('marks')
@UseGuards(UserGuard)
export class MarksController {
  constructor(private readonly marks: MarksService) {}

  @Get()
  library(@Req() request: AuthedRequest) {
    return this.marks.library(request.user.id);
  }

  @Post()
  toggle(@Req() request: AuthedRequest, @Body() body: unknown) {
    return this.marks.toggle(request.user, body);
  }
}
