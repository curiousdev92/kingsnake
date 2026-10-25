import { matchMaker, Room, type Client } from '@colyseus/core';
import { verifyPlayerToken } from '@snake/auth';
import { MODES, queueRoomName, type GameMode } from '@snake/game-modes';
import { START_RATING } from '@snake/meta';
import { MATCHED_MESSAGE, QUEUE_MESSAGE, type QueueMsg } from '@snake/protocol';
import { ArenaRoom, type JoinOptions } from './ArenaRoom';
import { QUEUE_SECRET, pairPlayers, type Waiting } from './matchmaking';

const PAIR_INTERVAL_MS = 500;

interface Entry extends Waiting {
  client: Client;
  options: JoinOptions;
}

/**
 * Ranked queue for one mode (`<mode.room>-queue`). Players wait here with their rating;
 * every half second the queue pairs close ratings (see matchmaking.ts), creates a
 * ranked room for each pair and hands both players a seat reservation for it.
 */
export class QueueRoom extends Room {
  override maxClients = 1000;
  private mode!: GameMode;
  private readonly waiting = new Map<string, Entry>();

  override onCreate() {
    this.mode = MODES.find((m) => queueRoomName(m) === this.roomName)!;
    this.clock.setInterval(() => void this.pair(), PAIR_INTERVAL_MS);
  }

  override async onAuth(_client: Client, options: JoinOptions = {}) {
    return { accountId: await verifyPlayerToken(options.token) };
  }

  override async onJoin(client: Client, options: JoinOptions = {}) {
    const accountId: string | null = (client.auth as { accountId?: string | null } | undefined)?.accountId ?? null;
    // Anonymous players queue at the starting rating; their matches are never ranked.
    const rating = (accountId && (await ArenaRoom.meta.lookupPlayer(accountId))?.rating) || START_RATING;
    this.waiting.set(client.sessionId, { id: client.sessionId, rating, since: Date.now(), client, options: { name: options.name, token: options.token } });
    client.send(QUEUE_MESSAGE, { rating, waiting: this.waiting.size } satisfies QueueMsg);
  }

  override onLeave(client: Client) {
    this.waiting.delete(client.sessionId);
  }

  private async pair(): Promise<void> {
    for (const pair of pairPlayers([...this.waiting.values()], Date.now())) {
      const entries = pair.map((w) => this.waiting.get(w.id)!);
      for (const e of entries) this.waiting.delete(e.id);
      try {
        const room = await matchMaker.createRoom(this.mode.room, { queued: QUEUE_SECRET });
        for (const e of entries) e.client.send(MATCHED_MESSAGE, await matchMaker.reserveSeatFor(room, e.options));
      } catch (err) {
        // Put them back at the front of the line and try again next round.
        console.error('queue: could not start a match', err);
        for (const e of entries) if (this.clients.some((c) => c.sessionId === e.id)) this.waiting.set(e.id, e);
      }
    }
  }
}
