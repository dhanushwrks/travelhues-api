import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StoreModule } from '../store/store.module.js';
import { FlightDealsAdminController } from './flight-deals-admin.controller.js';
import { FlightDealsController } from './flight-deals.controller.js';
import { FlightDealsService } from './flight-deals.service.js';

@Module({
  imports: [StoreModule, AuthModule, AdminModule],
  controllers: [FlightDealsController, FlightDealsAdminController],
  providers: [FlightDealsService],
  exports: [FlightDealsService],
})
export class FlightDealsModule {}
