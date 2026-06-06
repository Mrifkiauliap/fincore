import { createLogger } from "@fincore/logger";
import { getSharedValkey } from "@fincore/queue";
import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";

const logger = createLogger("health");

@Controller("health")
export class HealthController {
  /**
   * Lightweight health check for orchestrators / load balancers.
   * Returns 200 if the service is alive and Valkey is reachable.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<{ status: string; ts: number; valkey: string }> {
    let valkeyStatus = "unknown";
    try {
      const valkey = getSharedValkey();
      const ping = await valkey.ping();
      valkeyStatus = ping === "PONG" ? "ok" : "error";
    } catch {
      valkeyStatus = "error";
    }

    return {
      status: valkeyStatus === "ok" ? "healthy" : "degraded",
      ts: Date.now(),
      valkey: valkeyStatus,
    };
  }
}
