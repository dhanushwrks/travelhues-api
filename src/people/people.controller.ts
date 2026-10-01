import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  UnauthorizedException,
  Patch,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { OptionalUserGuard, type MaybeAuthedRequest } from '../auth/optional-user.guard.js';
import { UserGuard, type AuthedRequest } from '../auth/user.guard.js';
import { listCountries } from './countries.js';
import { PeopleService } from './people.service.js';

@Controller()
export class PeopleController {
  constructor(
    private readonly people: PeopleService,
    private readonly auth: AuthService,
  ) {}

  @Get('countries')
  countries() {
    return listCountries();
  }

  @Post('waitlist')
  @HttpCode(201)
  waitlist(@Body() body: unknown) {
    return this.people.submitWaitlist(body);
  }

  @Get('invites/:token')
  invite(@Param('token') token: string) {
    return this.people.previewInvite(token);
  }

  @Post('invites/:token/redeem')
  @HttpCode(201)
  redeem(@Param('token') token: string, @Body() body: unknown) {
    return this.people.redeemInvite(token, body);
  }

  @Post('media')
  @HttpCode(201)
  @UseGuards(UserGuard)
  upload(@Body() body: unknown) {
    return this.people.storePhoto(body);
  }

  @Get('media/:name')
  @Header('Cache-Control', 'public, max-age=86400')
  media(@Param('name') name: string) {
    if (!/^[a-f0-9]{16}\.(jpg|png|webp|mp4|webm|mov)$/.test(name)) {
      throw new NotFoundException('Media was not found');
    }
    const path = join(process.cwd(), 'data', 'media', name);
    if (!existsSync(path)) throw new NotFoundException('Media was not found');
    const type = name.endsWith('.png')
      ? 'image/png'
      : name.endsWith('.webp')
        ? 'image/webp'
        : name.endsWith('.mp4')
          ? 'video/mp4'
          : name.endsWith('.webm')
            ? 'video/webm'
            : name.endsWith('.mov')
              ? 'video/quicktime'
              : 'image/jpeg';
    return new StreamableFile(createReadStream(path), { type });
  }

  @Post('auth/session')
  async session(@Body() body: unknown) {
    const token =
      body && typeof body === 'object' && 'accessToken' in body
        ? (body as { accessToken?: unknown }).accessToken
        : undefined;
    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException('Sign in to continue');
    }
    const user = await this.auth.verify(token);
    await this.people.ensureProfile(user);
    await this.auth.admit(user);
    return { accessToken: token, user };
  }

  @Get('me')
  @UseGuards(UserGuard)
  async me(@Req() request: AuthedRequest) {
    await this.people.ensureProfile(request.user);
    return this.people.me(await this.auth.verify(this.token(request)));
  }

  @Get('usernames/:username/available')
  @UseGuards(UserGuard)
  usernameAvailable(@Param('username') username: string, @Req() request: AuthedRequest) {
    return this.people.usernameAvailable(request.user, username);
  }

  @Patch('me')
  @UseGuards(UserGuard)
  updateMe(@Req() request: AuthedRequest, @Body() body: unknown) {
    return this.people.updateMe(request.user, body);
  }

  @Post('me/password')
  @UseGuards(UserGuard)
  password(@Req() request: AuthedRequest, @Body() body: unknown) {
    return this.people.changePassword(request.user, body);
  }

  @Post('me/disable')
  @UseGuards(UserGuard)
  disable(@Req() request: AuthedRequest) {
    return this.people.disableMe(request.user);
  }

  @Delete('me')
  @HttpCode(204)
  @UseGuards(UserGuard)
  async remove(@Req() request: AuthedRequest) {
    await this.people.deleteMe(request.user);
  }

  @Get('profiles/:username')
  @UseGuards(OptionalUserGuard)
  profile(@Param('username') username: string, @Req() request: MaybeAuthedRequest) {
    return this.people.publicProfile(username, request.user ?? null);
  }

  private token(request: AuthedRequest) {
    const header = request.header('authorization') ?? '';
    return header.startsWith('Bearer ') ? header.slice(7) : '';
  }
}

@Controller('admin')
@UseGuards(AdminGuard)
export class PeopleAdminController {
  constructor(private readonly people: PeopleService) {}

  @Get('waitlist')
  waitlist() {
    return this.people.waitlist();
  }

  @Post('waitlist/:id/status')
  status(@Param('id') id: string, @Body() body: unknown) {
    return this.people.setWaitlistStatus(id, body);
  }

  @Get('invites')
  invites() {
    return this.people.invites();
  }

  @Post('invites')
  @HttpCode(201)
  createInvite(@Body() body: unknown) {
    return this.people.createInvite(body);
  }

  @Delete('invites/:token')
  @HttpCode(204)
  async revoke(@Param('token') token: string) {
    await this.people.revokeInvite(token);
  }
}
