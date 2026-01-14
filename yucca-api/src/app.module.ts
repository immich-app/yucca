import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './controllers/app.controller';
import env from './env';
import { LoggerRepository } from './repositories/logger.repository';
import { AppService } from './services/app.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: env.JWT_SECRET,
    }),
  ],
  controllers: [AppController],
  providers: [LoggerRepository, AppService],
})
export class AppModule {}
