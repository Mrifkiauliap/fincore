import { WaSendModule } from "@/modules/wa-send/wa-send.module";
import { Module } from "@nestjs/common";

@Module({
  imports: [WaSendModule],
})
export class SenderModule {}
