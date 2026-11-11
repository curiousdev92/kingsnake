import { token } from '@snake/design-tokens';
import { ffa } from '@snake/game-modes';
import { Button, Panel } from '@snake/ui-kit';
import { useEffect, useRef, useState } from 'react';
import { Renderer } from './game/Renderer';
import { Sandbox } from './game/Sandbox';
import { goHome } from './routes';
import { useHud } from './store';

/** Practice: offline against a full room of bots, with the same fixed tuning as online play. */
export function App() {
  const host = useRef<HTMLDivElement>(null);
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sb: Sandbox | null = null;
    const renderer = new Renderer();
    renderer.init(host.current!).then(() => {
      if (cancelled) return renderer.app.destroy(true);
      sb = new Sandbox(renderer, (stats) => useHud.setState(stats), ffa.maxPlayers - 1);
      setSandbox(sb);
    });
    return () => {
      cancelled = true;
      if (sb) {
        sb.destroy();
        renderer.app.destroy(true);
      }
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <Hud />
      {sandbox && <GameOver sandbox={sandbox} />}
      <Button variant="secondary" onClick={goHome} style={{ position: 'absolute', top: 12, right: 12, fontSize: token('font.sizeSm') }}>
        Leave
      </Button>
    </div>
  );
}

function Hud() {
  const { mass, alive, total } = useHud();
  return (
    <Panel style={{ position: 'absolute', top: 12, left: 12, padding: token('space.md'), pointerEvents: 'none' }}>
      <div style={{ fontFamily: token('font.display'), fontSize: token('font.sizeLg') }}>{mass}</div>
      <div style={{ color: token('color.textMuted'), fontSize: token('font.sizeSm') }}>
        {alive} / {total} alive
      </div>
    </Panel>
  );
}

function GameOver({ sandbox }: { sandbox: Sandbox }) {
  const { status, placement, total } = useHud();
  if (status === 'playing') return null;
  const title = status === 'won' ? 'You win!' : status === 'dead' ? 'You died' : 'Match over';
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <Panel style={{ textAlign: 'center', pointerEvents: 'auto', minWidth: 220, display: 'grid', gap: token('space.sm') }}>
        <div style={{ fontFamily: token('font.display'), fontSize: token('font.sizeXl') }}>{title}</div>
        <div style={{ color: token('color.textMuted'), marginBottom: token('space.sm') }}>
          {status === 'dead' ? `#${placement} of ${total}` : `Placed #${placement} of ${total}`}
        </div>
        <Button onClick={() => sandbox.restart()}>Play again</Button>
        <Button variant="secondary" onClick={goHome}>
          Home
        </Button>
      </Panel>
    </div>
  );
}
