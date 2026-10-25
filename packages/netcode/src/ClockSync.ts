interface Sample {
  rtt: number;
  offset: number;
}

/**
 * Estimates `serverTime - clientTime` from ping/pong round trips. Uses the sample
 * with the smallest RTT in a sliding window, since it has the least queuing error.
 */
export class ClockSync {
  private samples: Sample[] = [];
  private offset = 0;

  constructor(private readonly window = 10) {}

  get synced(): boolean {
    return this.samples.length > 0;
  }

  /** Latest measured round-trip time in ms. */
  rtt = 0;

  addSample(clientSendTime: number, serverTime: number, clientRecvTime: number): void {
    const rtt = Math.max(0, clientRecvTime - clientSendTime);
    this.rtt = rtt;
    this.samples.push({ rtt, offset: serverTime + rtt / 2 - clientRecvTime });
    if (this.samples.length > this.window) this.samples.shift();
    let best = this.samples[0]!;
    for (const s of this.samples) if (s.rtt < best.rtt) best = s;
    this.offset = best.offset;
  }

  serverNow(clientNow: number): number {
    return clientNow + this.offset;
  }
}
