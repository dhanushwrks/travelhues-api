import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StoreModule } from '../store/store.module.js';
import { GlimpsesController } from './glimpses.controller.js';
import { GlimpsesService } from './glimpses.service.js';

@Module({
  imports: [StoreModule, AuthModule],
  controllers: [GlimpsesController],
  providers: [GlimpsesService],
})
export class GlimpsesModule {}
