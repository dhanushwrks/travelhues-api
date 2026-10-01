import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { UserGuard, type AuthedRequest } from '../auth/user.guard.js';
import { PurchasesService } from './purchases.service.js';

@Controller('purchases')
@UseGuards(UserGuard)
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Post()
  purchase(@Req() request: AuthedRequest, @Body() body: unknown) {
    return this.purchases.purchase(request.user, body);
  }
}
