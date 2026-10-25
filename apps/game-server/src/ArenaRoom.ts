import { Room, type Client } from '@colyseus/core';
import { makeConfig, type SimConfig } from '@snake/game-core';
import {
  MATCH_MESSAGE,
  MAX_SNAKES,
  Msg,
  SETTINGS_MESSAGE,
  START_MESSAGE,
  decodeInput,
  decodePing,
  encodeEvents,
  encodePong,
  encodeSnapshot,
  type MatchMsg,
  type MatchPhase,
  type RosterEntry,
  type SettingsMsg,
} from '@snake/protocol';
import { Match } from './Match';
import { botNames, roomCode } from './names';

export interface ArenaOptions {
  /** Private rooms get a short code, never take matchmaking traffic, and start when the host says so. */
  private?: boolean;
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

/**
 * Lobby and match timings. Server-side only (clients can pass create options, so
 * these are deliberately not options); tests shorten them.
 */
export const timing = {
  /** Public lobby: how long to gather players after the first one joins. */
  lobbyWaitMs: 10_000,
  /** Public lobby: when the room fills, start within this long. */
  fullLobbyMs: 3_000,
  /** Private rooms: countdown after the host presses start. */
  countdownMs: 3_000,
  resultsMs: 5_000,
};

/** Humans per room, and the match size public rooms fill to with bots. */
export const ROOM_SIZE = 8;
const DEFAULT_PRIVATE_BOTS = 6;
const RECONNECT_SECONDS = 10;

const now = () => performance.now();

function sanitizeName(name: unknown): string {
  const s = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) : '';
  return s || 'Player';
}

/**
 * One arena. Public rooms are filled by matchmaking: the first player starts a lobby
 * timer, and when it runs out the match starts with bots filling the empty slots.
 * Public rooms lock while playing so newcomers get a fresh room. Private rooms are
 * joined by code, the host picks the bot count and starts each match.
 *
 * Runs an authoritative Match and streams custom binary snapshots; no Colyseus Schema.
 */
export class ArenaRoom extends Room {
  override maxClients = ROOM_SIZE;
  // Inputs at 30 Hz plus pings; anything far above that is abuse.
  override maxMessagesPerSecond = 120;

  private readonly cfg: SimConfig = makeConfig();
  private isPrivate = false;
  private privateBots = DEFAULT_PRIVATE_BOTS;
  private phase: MatchPhase = 'waiting';
  private phaseEndsAt: number | null = null;
  private match: Match | null = null;
  private roster: RosterEntry[] = [];
  private winnerId: number | null = null;
  private hostSession: string | null = null;
  private readonly players = new Map<string, Player>();

  override onCreate(options: ArenaOptions = {}) {
    this.isPrivate = options.private === true;
    if (this.isPrivate) {
      this.roomId = roomCode();
      void this.setPrivate(true);
    }

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
    this.onMessage(SETTINGS_MESSAGE, (client, msg: SettingsMsg) => {
      if (!this.isHostWaiting(client)) return;
      const bots = Math.floor(Number(msg?.bots));
      if (!Number.isFinite(bots)) return;
      this.privateBots = Math.max(0, Math.min(MAX_SNAKES - this.humans, bots));
      this.broadcastMatch();
    });
    this.onMessage(START_MESSAGE, (client) => {
      if (!this.isHostWaiting(client) || this.humans + this.botsForNextMatch() < 2) return;
      this.setPhase('countdown', now() + timing.countdownMs);
    });

    this.setSimulationInterval(() => this.update(), 1000 / 60);
  }

  override onJoin(client: Client, options: JoinOptions = {}) {
    this.players.set(client.sessionId, { name: sanitizeName(options.name), snakeId: null, needsFull: true });
    this.hostSession ??= client.sessionId;
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
    if (this.hostSession === client.sessionId) this.hostSession = this.players.keys().next().value ?? null;
    this.broadcastMatch();
  }

  private get humans(): number {
    return this.players.size;
  }

  private isHostWaiting(client: Client): boolean {
    return this.isPrivate && this.phase === 'waiting' && client.sessionId === this.hostSession;
  }

  private botsForNextMatch(): number {
    if (this.isPrivate) return Math.min(this.privateBots, MAX_SNAKES - this.humans);
    return Math.max(0, ROOM_SIZE - this.humans);
  }

  private update(): void {
    const t = now();
    switch (this.phase) {
      case 'waiting':
        // Private rooms wait for the host's start message.
        if (!this.isPrivate && this.humans > 0) this.setPhase('countdown', t + timing.lobbyWaitMs);
        break;
      case 'countdown':
        if (this.humans === 0) {
          this.setPhase('waiting', null);
        } else if (t >= this.phaseEndsAt!) {
          this.startMatch(t);
        } else if (!this.isPrivate && this.humans >= ROOM_SIZE && this.phaseEndsAt! - t > timing.fullLobbyMs) {
          this.setPhase('countdown', t + timing.fullLobbyMs); // full: no reason to wait
        }
        break;
      case 'playing':
        this.stepMatch(t);
        if (this.match!.finished) {
          this.winnerId = this.match!.state.winnerId;
          this.setPhase('ended', t + timing.resultsMs);
        }
        break;
      case 'ended':
        this.stepMatch(t); // keeps snapshots flowing so the winner is still visible
        if (t >= this.phaseEndsAt!) {
          this.match = null;
          for (const p of this.players.values()) p.snakeId = null;
          if (!this.isPrivate) void this.unlock();
          this.setPhase('waiting', null);
        }
        break;
    }
  }

  private startMatch(t: number): void {
    const humans = [...this.players.values()];
    const names = botNames(this.botsForNextMatch());
    const specs = [...humans.map((p) => ({ name: p.name })), ...names.map((name) => ({ name, isBot: true }))];
    this.match = new Match(specs, this.cfg, t);
    humans.forEach((p, i) => {
      p.snakeId = this.match!.state.snakes[i]!.id;
      p.needsFull = true;
    });
    this.roster = this.match.state.snakes.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot }));
    this.winnerId = null;
    // Public rooms stop taking players mid-match, so matchmaking opens a fresh room.
    if (!this.isPrivate) void this.lock();
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

  private matchMsg(sessionId: string): MatchMsg {
    return {
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      you: this.players.get(sessionId)?.snakeId ?? null,
      roster: this.roster,
      winnerId: this.winnerId,
      lobby: {
        private: this.isPrivate,
        code: this.roomId,
        youAreHost: sessionId === this.hostSession,
        players: [...this.players].map(([id, p]) => ({ name: p.name, host: id === this.hostSession, you: id === sessionId })),
        maxPlayers: this.maxClients,
        bots: this.botsForNextMatch(),
      },
      config: this.cfg,
    };
  }

  private sendMatch(client: Client): void {
    client.send(MATCH_MESSAGE, this.matchMsg(client.sessionId));
  }

  private broadcastMatch(): void {
    for (const client of this.clients) this.sendMatch(client);
  }
}
