import { createLogger } from "@fincore/logger";

const logger = createLogger("lib:circuit-breaker");

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms the circuit stays open before transitioning to half-open */
  cooldownMs: number;
  /** Name for logging */
  name: string;
}

/**
 * Simple circuit breaker pattern implementation.
 *
 * CLOSED  → normal operation, requests pass through
 * OPEN    → requests fail fast (skip immediately) for cooldown duration
 * HALF_OPEN → single trial request allowed; success closes, failure re-opens
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;
  private readonly opts: CircuitBreakerOptions;

  constructor(opts: CircuitBreakerOptions) {
    this.opts = opts;
  }

  /**
   * Execute the primary function with circuit breaker protection.
   * If the circuit is OPEN, throws immediately without calling fn().
   * If the circuit is HALF_OPEN, allows one trial call.
   *
   * @returns the result of fn()
   * @throws the error from fn() or a CircuitBreakerOpenError
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttemptTime) {
        const remainingMs = this.nextAttemptTime - Date.now();
        logger.warn(
          {
            name: this.opts.name,
            state: this.state,
            remainingMs,
          },
          "Circuit OPEN — request blocked",
        );
        throw new CircuitBreakerOpenError(
          `${this.opts.name} circuit is OPEN for ${Math.ceil(remainingMs / 1000)}s more`,
        );
      }
      // Cooldown elapsed → transition to HALF_OPEN
      this.state = "HALF_OPEN";
      logger.info(
        { name: this.opts.name },
        "Circuit transitioning CLOSED → HALF_OPEN",
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /** Check if the circuit is currently OPEN (requests should be blocked) */
  get isOpen(): boolean {
    return this.state === "OPEN" && Date.now() < this.nextAttemptTime;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = "CLOSED";
    logger.info({ name: this.opts.name }, "Circuit CLOSED");
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (
      this.state === "HALF_OPEN" ||
      this.failureCount >= this.opts.failureThreshold
    ) {
      this.state = "OPEN";
      this.nextAttemptTime = Date.now() + this.opts.cooldownMs;
      logger.warn(
        {
          name: this.opts.name,
          failureCount: this.failureCount,
          cooldownMs: this.opts.cooldownMs,
        },
        "Circuit OPEN — too many failures",
      );
    }
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}
