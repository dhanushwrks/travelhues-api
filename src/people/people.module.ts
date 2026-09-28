import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { StoreModule } from '../store/store.module.js';
import { PeopleAdminController, PeopleController } from './people.controller.js';
import { PeopleService } from './people.service.js';

@Module({
  imports: [StoreModule, AuthModule],
  controllers: [PeopleController, PeopleAdminController],
  providers: [PeopleService, AdminGuard],
})
export class PeopleModule {}
