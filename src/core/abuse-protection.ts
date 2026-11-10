import { nowIso } from "../utils/encoding.js";

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: string;
}

export class TokenBucket {
  private tokens: number;
  private updatedAtMs = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number
  ) {
    if (capacity <= 0 || refillPerSecond <= 0) {
      throw new Error("TokenBucket requires positive capacity and refill rate");
    }
    this.tokens = capacity;
  }

  take(cost = 1): RateLimitDecision {
    this.refill();

    if (cost <= 0) {
      throw new Error("Token cost must be positive");
    }

    if (this.tokens >= cost) {
      this.tokens -= cost;
      return {
        allowed: true,
        remaining: Math.floor(this.tokens),
        resetAt: this.resetAt()
      };
    }

    return {
      allowed: false,
      remaining: Math.floor(this.tokens),
      resetAt: this.resetAt()
    };
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.updatedAtMs) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.updatedAtMs = now;
  }

  private resetAt(): string {
    if (this.tokens >= this.capacity) {
      return nowIso();
    }
    const secondsUntilFull = (this.capacity - this.tokens) / this.refillPerSecond;
    return new Date(Date.now() + secondsUntilFull * 1000).toISOString();
  }
}
