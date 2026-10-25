import { Room, type Client } from '@colyseus/core';
import { makeConfig, type SimConfig } from '@snake/game-core';
import {
  MATCH_MESSAGE,
  Msg,
  decodeInput,
  decodePing,
  encodeEvents,
  encodePong,
  encodeSnapshot,
  type MatchMsg,
  type MatchPhase,
  type RosterEntry,
} from '@snake/protocol';
import { Match } from './Match';

export interface ArenaOptions {
  /** Bots added to every match. With bots, one human is enough to start. */
  bots?: number;
  /** Humans needed before the countdown starts (default 2). */
  minPlayers?: number;
}

export interface JoinOptions {
  name?: string;
}

interface Player {
  name: string;
  /** Snake in the current match, or null when waiting/spectating. */
  snakeId: number | null;
  /** Next snapshot carries every body (just joined, reconnected or match started). */
  needsFull: boolean;
}

const COUNTDOWN_MS = 3000;
const RESULTS_MS = 5000;
const RECONNECT_SECONDS = 10;
const MAX_SNAKES = 16;

const now = () => performance.now();

function sanitizeName(name: unknown): string {
  const s = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) : '';
  return s || 'Player';
}

/**
 * One arena: waits for players, counts down, runs an authoritative Match and
 * streams custom binary snapshots. No Colyseus Schema state is used.
 */
export class ArenaRoom extends Room {
  override maxClients = 8;
  // Inputs at 30 Hz plus pings; anything far above that is abuse.
  override maxMessagesPerSecond = 120;

  private readonly cfg: SimConfig = makeConfig();
  private bots = 0;
  private minPlayers = 2;
  private phase: MatchPhase = 'waiting';
  private phaseEndsAt: number | null = null;
  private match: Match | null = null;
  private roster: RosterEntry[] = [];
  private winnerId: number | null = null;
  private readonly players = new Map<string, Player>();

  override onCreate(options: ArenaOptions = {}) {
    this.bots = Math.max(0, Math.min(MAX_SNAKES - 1, Math.floor(Number(options.bots) || 0)));
    this.minPlayers = this.bots > 0 ? 1 : Math.max(1, Math.min(this.maxClients, Math.floor(Number(options.minPlayers) || 2)));
    this.maxClients = Math.min(this.maxClients, MAX_SNAKES - this.bots);

    this.onMessageBytes(Msg.Input, (client, bytes: Uint8Array) => {
      const p = this.players.get(client.sessionId);
      if (!this.match || p?.snakeId == null) return;
      try {
        this.match.setInput(p.snakeId, decodeInput(bytes));
      } catch {
        // Malformed input: ignore it.
      }
    });
    this.onMessageBytes(Msg.Ping, (client, bytes: Uint8Array) => {
      try {
        client.sendBytes(Msg.Pong, encodePong({ clientTime: decodePing(bytes), serverTime: now() }));
      } catch {
        // Malformed ping: ignore it.
      }
    });

    this.setSimulationInterval(() => this.update(), 1000 / 60);
  }

  override onJoin(client: Client, options: JoinOptions = {}) {
    this.players.set(client.sessionId, { name: sanitizeName(options.name), snakeId: null, needsFull: true });
    this.syncNewcomer(client);
    this.broadcastMatch();
  }

  override onDrop(client: Client) {
    // Keep the snake running on its last input while the client tries to reconnect.
    this.allowReconnection(client, RECONNECT_SECONDS);
  }

  override onReconnect(client: Client) {
    const p = this.players.get(client.sessionId);
    if (p) p.needsFull = true;
    this.syncNewcomer(client);
  }

  override onLeave(client: Client) {
    const p = this.players.get(client.sessionId);
    if (p?.snakeId != null) this.match?.convertToBot(p.snakeId);
    this.players.delete(client.sessionId);
    this.broadcastMatch();
  }

  private get humans(): number {
    return this.players.size;
  }

  private update(): void {
    const t = now();
    switch (this.phase) {
      case 'waiting':
        if (this.humans >= this.minPlayers) this.setPhase('countdown', t + COUNTDOWN_MS);
        break;
      case 'countdown':
        if (this.humans < this.minPlayers) this.setPhase('waiting', null);
        else if (t >= this.phaseEndsAt!) this.startMatch(t);
        break;
      case 'playing':
        this.stepMatch(t);
        if (this.match!.finished) {
          this.winnerId = this.match!.state.winnerId;
          this.setPhase('ended', t + RESULTS_MS);
        }
        break;
      case 'ended':
        this.stepMatch(t); // keeps snapshots flowing so the winner is still visible
        if (t >= this.phaseEndsAt!) {
          this.match = null;
          for (const p of this.players.values()) p.snakeId = null;
          this.setPhase('waiting', null);
        }
        break;
    }
  }

  private startMatch(t: number): void {
    const humans = [...this.players.values()];
    const specs = [
      ...humans.map((p) => ({ name: p.name })),
      ...Array.from({ length: this.bots }, (_, i) => ({ name: `Bot ${i + 1}`, isBot: true })),
    ];
    this.match = new Match(specs, this.cfg, t);
    humans.forEach((p, i) => {
      p.snakeId = this.match!.state.snakes[i]!.id;
      p.needsFull = true;
    });
    this.roster = this.match.state.snakes.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot }));
    this.winnerId = null;
    this.broadcast(Msg.Events, encodeEvents(this.match.fullPellets()));
    this.setPhase('playing', null);
  }

  private stepMatch(t: number): void {
    const match = this.match!;
    const before = match.state.tick;
    for (const e of match.advance(t)) this.broadcast(Msg.Events, encodeEvents(e));
    if (match.state.tick === before) return;
    for (const client of this.clients) {
      const p = this.players.get(client.sessionId);
      if (!p) continue;
      client.sendBytes(Msg.Snapshot, encodeSnapshot(match.snapshot(p.snakeId, p.needsFull)));
      p.needsFull = false;
    }
  }

  /** Brings a joining or reconnecting client up to date with the match in progress. */
  private syncNewcomer(client: Client): void {
    this.sendMatch(client);
    if (this.match) client.sendBytes(Msg.Events, encodeEvents(this.match.fullPellets()));
  }

  private setPhase(phase: MatchPhase, endsAt: number | null): void {
    this.phase = phase;
    this.phaseEndsAt = endsAt;
    this.broadcastMatch();
  }

  private matchMsg(p: Player | undefined): MatchMsg {
    return {
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      you: p?.snakeId ?? null,
      roster: this.roster,
      winnerId: this.winnerId,
      needPlayers: Math.max(0, this.minPlayers - this.humans),
      config: this.cfg,
    };
  }

  private sendMatch(client: Client): void {
    client.send(MATCH_MESSAGE, this.matchMsg(this.players.get(client.sessionId)));
  }

  private broadcastMatch(): void {
    for (const client of this.clients) this.sendMatch(client);
  }
}
