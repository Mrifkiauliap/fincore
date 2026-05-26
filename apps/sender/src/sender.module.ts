import { WaSendModule } from "@/modules/wa-send/wa-send.module";
import { Module } from "@nestjs/common";

@Module({
  imports: [
    WaSendModule,
    // TODO: add modules as we build them:
    // SchedulerModule,
  ],
})
export class SenderModule {}
