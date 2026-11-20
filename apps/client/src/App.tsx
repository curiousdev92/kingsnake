import { ffa } from "@snake/game-modes";
import { Button, Panel } from "@snake/ui-kit";
import { useEffect, useRef, useState } from "react";
import { Renderer } from "./game/Renderer";
import { Sandbox } from "./game/Sandbox";
import { goHome } from "./routes";
import { useHud } from "./store";

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
    <div className="fixed inset-0">
      <div ref={host} className="absolute inset-0" />
      <Hud />
      {sandbox && <GameOver sandbox={sandbox} />}
      <Button variant="secondary" onClick={goHome} className="absolute right-3 top-3 text-xs">
        Leave
      </Button>
    </div>
  );
}

function Hud() {
  const { mass, alive, total } = useHud();
  return (
    <Panel className="pointer-events-none absolute left-3 top-3 p-3">
      <div className="text-xl ">{mass}</div>
      <div className="text-sm text-[var(--color-muted)]">
        {alive} / {total} alive
      </div>
    </Panel>
  );
}

function GameOver({ sandbox }: { sandbox: Sandbox }) {
  const { status, placement, total } = useHud();
  if (status === "playing") return null;
  const title = status === "won" ? "You win!" : status === "dead" ? "You died" : "Match over";
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <Panel className="pointer-events-auto grid min-w-[220px] gap-2 text-center">
        <div className="text-3xl ">{title}</div>
        <div className="mb-1 text-sm text-[var(--color-muted)]">
          {status === "dead" ? `#${placement} of ${total}` : `Placed #${placement} of ${total}`}
        </div>
        <Button onClick={() => sandbox.restart()}>Play again</Button>
        <Button variant="secondary" onClick={goHome}>
          Home
        </Button>
      </Panel>
    </div>
  );
}
