import { Module } from '@nestjs/common';
import { WholesalersController } from './wholesalers.controller';
import { WholesalersService } from './wholesalers.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [WholesalersController],
  providers: [WholesalersService],
  exports: [WholesalersService],
})
export class WholesalersModule {}
