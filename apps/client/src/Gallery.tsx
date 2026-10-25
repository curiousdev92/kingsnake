import { setManifest, shippedManifest, type AssetManifest, type NineSlice } from '@snake/assets';
import { token } from '@snake/design-tokens';
import { Badge, Button, Chip, CurrencyPill, IconButton, Modal, Panel, ProgressBar, Tabs } from '@snake/ui-kit';
import { useState, type ReactNode } from 'react';

/** Placeholder 9-slice art generated as SVG, to prove skins drop in without code changes. */
function demoSlice(fill: string, stroke: string, r = 14): NineSlice {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect x="3" y="3" width="58" height="58" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="5"/>
    <rect x="9" y="8" width="46" height="10" rx="5" fill="#fff" opacity="0.35"/></svg>`;
  return { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, slice: { left: 18, top: 18, right: 18, bottom: 18 } };
}

const demoArt: AssetManifest = {
  nineSlices: {
    'button.primary.normal': demoSlice('#ffb703', '#7a4a00'),
    'button.primary.pressed': demoSlice('#e09a00', '#7a4a00'),
    'button.primary.disabled': demoSlice('#777', '#333'),
    'button.secondary.normal': demoSlice('#3a86ff', '#0b2e6b'),
    'button.secondary.pressed': demoSlice('#2a6fdc', '#0b2e6b'),
    'button.icon.normal': demoSlice('#3a86ff', '#0b2e6b'),
    'button.icon.pressed': demoSlice('#2a6fdc', '#0b2e6b'),
    'panel.main.normal': demoSlice('#24314f', '#0d1426', 20),
    'panel.inset.normal': demoSlice('#1a2440', '#0d1426'),
    'panel.inset.selected': demoSlice('#2b3d6b', '#ffb703'),
    'modal.frame.normal': demoSlice('#24314f', '#ffb703', 20),
    'chip.gold.normal': demoSlice('#3d2c00', '#ffb703', 30),
    'tab.normal': demoSlice('#1a2440', '#0d1426'),
    'tab.selected': demoSlice('#ffb703', '#7a4a00'),
  },
  icons: {},
};

/** Every ui-kit component in one page. Open with `#ui`. */
export function Gallery() {
  const [art, setArt] = useState(false);
  const [modal, setModal] = useState(false);
  const [tab, setTab] = useState<'play' | 'shop' | 'profile'>('play');
  const [coins, setCoins] = useState(1250);
  const [xp, setXp] = useState(0.35);
  const [selected, setSelected] = useState(0);

  const toggleArt = () => {
    setManifest(art ? shippedManifest : demoArt);
    setArt(!art);
  };

  return (
    // Remount on art toggle so components re-read the manifest.
    <div key={String(art)} style={{ height: '100%', overflow: 'auto', background: token('color.background'), color: token('color.text'), fontFamily: token('font.body') }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: token('space.lg'), display: 'grid', gap: token('space.lg') }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontFamily: token('font.display'), fontSize: token('font.sizeXl') }}>UI kit</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={toggleArt}>{art ? 'Use fallbacks' : 'Try demo art'}</Button>
            <Button variant="secondary" onClick={() => (location.hash = '')}>Back to game</Button>
          </div>
        </header>

        <Section title="Button">
          <Button>Play</Button>
          <Button variant="secondary">Shop</Button>
          <Button variant="danger">Leave</Button>
          <Button disabled>Locked</Button>
        </Section>

        <Section title="IconButton + Badge">
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

        <Section title="Chip + CurrencyPill">
          <Chip>Level 7</Chip>
          <CurrencyPill currency="coin" amount={coins} />
          <CurrencyPill currency="gem" amount={42} />
          <Button variant="secondary" onClick={() => setCoins((c) => c + 250)}>+250 coins</Button>
        </Section>

        <Section title="ProgressBar">
          <div style={{ display: 'grid', gap: 10, width: '100%' }}>
            <ProgressBar value={xp} label="XP" />
            <ProgressBar value={0.8} kind="health" label="Health" />
            <ProgressBar value={0.2} kind="timer" height={8} label="Timer" />
            <div>
              <Button variant="secondary" onClick={() => setXp((v) => (v >= 1 ? 0 : Math.min(1, v + 0.2)))}>Gain XP</Button>
            </div>
          </div>
        </Section>

        <Section title="Tabs">
          <div style={{ width: '100%' }}>
            <Tabs
              items={[
                { value: 'play', label: 'Play' },
                { value: 'shop', label: 'Shop' },
                { value: 'profile', label: 'Profile' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
        </Section>

        <Section title="Panel">
          <div style={{ display: 'grid', gap: 8, width: '100%' }}>
            {['Daily mission: eat 500 pellets', 'Daily mission: win a match'].map((m, i) => (
              <Panel key={m} variant="inset" selected={selected === i} onClick={() => setSelected(i)} style={{ cursor: 'pointer' }}>
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
        <p style={{ marginTop: 0 }}>You earned 250 coins.</p>
        <Button onClick={() => setModal(false)}>Collect</Button>
      </Modal>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel>
      <h2 style={{ margin: `0 0 ${token('space.md')}`, fontSize: token('font.sizeMd'), color: token('color.textMuted') }}>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: token('space.md'), alignItems: 'center' }}>{children}</div>
    </Panel>
  );
}
