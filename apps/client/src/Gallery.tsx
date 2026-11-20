import {
  Badge,
  Button,
  Chip,
  CurrencyPill,
  IconButton,
  Modal,
  Panel,
  ProgressBar,
  Tabs,
} from "@snake/ui-kit";
import { useState, type ReactNode } from "react";

/** Component gallery. Open with `#ui`. */
export function Gallery() {
  const [modal, setModal] = useState(false);
  const [tab, setTab] = useState<"play" | "shop" | "profile">("play");
  const [coins, setCoins] = useState(1250);
  const [xp, setXp] = useState(0.35);
  const [selected, setSelected] = useState(0);

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="mx-auto grid max-w-3xl gap-5 p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 text-3xl ">UI</h1>
          <Button variant="secondary" onClick={() => (location.hash = "")}>
            Back to game
          </Button>
        </header>

        <Section title="Buttons">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
        </Section>

        <Section title="Icon buttons & badges">
          <IconButton icon="icon.settings" label="Settings" />
          <Badge count={3}>
            <IconButton icon="icon.missions" label="Missions" />
          </Badge>
          <Badge count={120}>
            <IconButton icon="icon.friends" label="Friends" />
          </Badge>
          <Badge count>
            <IconButton icon="icon.shop" label="Shop" />
          </Badge>
        </Section>

        <Section title="Chips & currency">
          <Chip>Level 7</Chip>
          <CurrencyPill currency="coin" amount={coins} />
          <CurrencyPill currency="gem" amount={42} />
          <Button variant="secondary" onClick={() => setCoins((c) => c + 250)}>
            +250 coins
          </Button>
        </Section>

        <Section title="Progress">
          <div className="grid w-full gap-3">
            <ProgressBar value={xp} label="XP" />
            <ProgressBar value={0.8} kind="health" label="Health" />
            <ProgressBar value={0.2} kind="timer" height={8} label="Timer" />
            <div>
              <Button
                variant="secondary"
                onClick={() => setXp((v) => (v >= 1 ? 0 : Math.min(1, v + 0.2)))}
              >
                Gain XP
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Tabs">
          <div className="w-full">
            <Tabs
              items={[
                { value: "play", label: "Play" },
                { value: "shop", label: "Shop" },
                { value: "profile", label: "Profile" },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
        </Section>

        <Section title="Panels">
          <div className="grid w-full gap-2">
            {["Daily mission: eat 500 pellets", "Daily mission: win a match"].map((m, i) => (
              <Panel
                key={m}
                variant="inset"
                selected={selected === i}
                onClick={() => setSelected(i)}
                className="cursor-pointer"
              >
                {m}
              </Panel>
            ))}
          </div>
        </Section>

        <Section title="Modal">
          <Button onClick={() => setModal(true)}>Open modal</Button>
        </Section>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Reward">
        <p className="mt-0">You earned 250 coins.</p>
        <Button onClick={() => setModal(false)}>Collect</Button>
      </Modal>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel className="grid gap-3">
      <h2 className="m-0 text-sm font-medium text-[var(--color-muted)]">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </Panel>
  );
}
