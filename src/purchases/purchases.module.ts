import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StoreModule } from '../store/store.module.js';
import { FlightDealsModule } from '../flight-deals/flight-deals.module.js';
import { PurchasesController } from './purchases.controller.js';
import { PurchasesService } from './purchases.service.js';

@Module({
  imports: [StoreModule, AuthModule, FlightDealsModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
