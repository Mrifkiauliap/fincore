import { WaSendProcessor } from "@/modules/wa-send/wa-send.processor";
import { WaSendService } from "@/modules/wa-send/wa-send.service";
import { Module } from "@nestjs/common";

@Module({
  providers: [WaSendService, WaSendProcessor],
  exports: [WaSendService],
})
export class WaSendModule {}
