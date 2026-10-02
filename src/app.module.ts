import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ContentModule } from './content/content.module.js';
import { GlimpsesModule } from './glimpses/glimpses.module.js';
import { MarksModule } from './marks/marks.module.js';
import { PeopleModule } from './people/people.module.js';
import { PurchasesModule } from './purchases/purchases.module.js';
import { FlightDealsModule } from './flight-deals/flight-deals.module.js';

@Module({
  imports: [
    AuthModule,
    ContentModule,
    AdminModule,
    PeopleModule,
    GlimpsesModule,
    MarksModule,
    PurchasesModule,
    FlightDealsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
