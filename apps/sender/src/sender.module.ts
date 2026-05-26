import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    // TODO: add modules as we build them:
    // WaSendModule,
    // SchedulerModule,
  ],
})
export class SenderModule {}
