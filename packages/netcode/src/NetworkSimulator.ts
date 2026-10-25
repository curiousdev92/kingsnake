export interface NetConditions {
  /** Added one-way delay in ms. */
  latencyMs: number;
  /** Extra random one-way delay in [0, jitterMs). */
  jitterMs: number;
  /** Chance in [0, 1] to drop an unreliable message. */
  loss: number;
}

export const perfectNetwork: NetConditions = { latencyMs: 0, jitterMs: 0, loss: 0 };

export interface SimulatorDeps {
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => void;
  random: () => number;
}

const defaultDeps: SimulatorDeps = {
  now: () => performance.now(),
  schedule: (fn, ms) => (ms <= 0 ? fn() : void setTimeout(fn, ms)),
  random: Math.random,
};

/**
 * Delays, jitters and drops messages in one direction. Reliable messages are never
 * dropped and stay in order (like TCP, loss there shows up as delay); unreliable
 * ones can be dropped or reordered, as they would be over datagrams.
 */
export class NetworkSimulator {
  conditions: NetConditions;
  private lastReliableAt = 0;
  private readonly deps: SimulatorDeps;

  constructor(conditions: NetConditions = perfectNetwork, deps: Partial<SimulatorDeps> = {}) {
    this.conditions = { ...conditions };
    this.deps = { ...defaultDeps, ...deps };
  }

  deliver(fn: () => void, reliable: boolean): void {
    const { latencyMs, jitterMs, loss } = this.conditions;
    const { now, schedule, random } = this.deps;
    if (!reliable && loss > 0 && random() < loss) return;
    const t = now();
    let at = t + latencyMs + (jitterMs > 0 ? random() * jitterMs : 0);
    if (reliable) {
      at = Math.max(at, this.lastReliableAt);
      this.lastReliableAt = at;
    }
    schedule(fn, at - t);
  }
}
