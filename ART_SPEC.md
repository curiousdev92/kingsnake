# Snake Arena: Art Spec for UI and Game Assets

Hand this to your artist. All names match `packages/assets/assets.manifest.ts`, so delivered files can be plugged in without code changes.

## 1. Style direction

- Bold, chunky, glossy mobile-game look: thick outlines, soft bevels, top-light highlights, strong drop shadows, saturated colors.
- Friendly and readable at small sizes on a phone. Shapes first, detail second.
- **Original art only.** Take inspiration from the genre, but do not copy or trace assets, characters or logos from existing games.
- Keep one consistent light direction (top-left) and one outline weight family across all assets.
- Provide a small palette (6-8 core colors plus neutrals) so it can be mapped into design tokens.

## 2. Export rules

- Format: PNG-24 with alpha (WebP can be generated later).
- Scales: export `@1x`, `@2x`, `@3x`. Design at 1x = 160 dpi-equivalent logical pixels, so a 48px button corner at 1x is 96px at 2x.
- No baked-in text on buttons or panels. Text is rendered by the app (localization and font tokens).
- Keep 4px transparent padding at 1x around shadows so they are not clipped.
- Source files (PSD/Figma/AI) are delivered separately and are not committed to the repo.

## 3. File naming

`<category>.<name>.<variant>.<state>@<scale>x.png`

Examples: `button.primary.default.normal@2x.png`, `icon.coin@3x.png`, `frame.avatar.gold@2x.png`.

States where relevant: `normal`, `pressed`, `disabled`. Optional: `hover` (web only), `selected`.

## 4. 9-slice UI elements

Each is delivered as one image plus the slice insets (left, top, right, bottom) in 1x pixels, written in a sidecar `*.slice.json`, for example `{ "left": 24, "top": 24, "right": 24, "bottom": 32 }`. Corners and edges must survive stretching: no gradients that depend on exact size, and no details inside the stretchable center.

| Asset | Variants | States | Min size at 1x |
|---|---|---|---|
| `button.primary` | default | normal, pressed, disabled | 96x56 |
| `button.secondary` | default | normal, pressed, disabled | 96x56 |
| `button.danger` | default | normal, pressed, disabled | 96x56 |
| `button.icon` (square) | default | normal, pressed, disabled | 56x56 |
| `panel.main` | default, dark, gold | normal | 96x96 |
| `panel.inset` (list rows, slots) | default | normal, selected | 64x48 |
| `modal.frame` | default | normal | 128x128 |
| `chip` (labels, currency pills) | default, gold, gem | normal | 64x32 |
| `progressbar.track` / `progressbar.fill` | xp, health, timer | normal | 48x20 |
| `tab` | default | normal, selected | 80x44 |
| `badge.notification` | default | normal | 24x24 |

## 5. Icons (single images, not sliced)

Size at 1x: 64x64 for large, 32x32 for small. Provide a clean silhouette so they read at 32px.

- Currencies: `icon.coin`, `icon.gem`, `icon.xp`, `icon.trophy`
- Navigation: `icon.play`, `icon.shop`, `icon.profile`, `icon.friends`, `icon.missions`, `icon.settings`, `icon.leaderboard`
- Actions: `icon.close`, `icon.back`, `icon.copy`, `icon.share`, `icon.sound.on`, `icon.sound.off`, `icon.vibration`
- Game: `icon.crown` (winner), `icon.skull` (kills), `icon.clock`, `icon.heart`, `icon.speed`, `icon.shield`

## 6. Avatars and frames

- `avatar.<id>` : 128x128, square, transparent corners handled by frame
- `frame.avatar.default / bronze / silver / gold / legendary` : 144x144 ring with a transparent center
- `rank.badge.<tier>` : 96x96 for tiers bronze, silver, gold, platinum, diamond, master

## 7. Rewards and progression

- `chest.<tier>.closed` and `chest.<tier>.open`: 192x192, tiers common, rare, epic, legendary
- `reward.glow` : 256x256 radial burst, additive-friendly (transparent background)
- `reward.card.<rarity>` : 9-slice frame, rarities common, rare, epic, legendary
- `streak.flame` : 64x64 (daily login streak)
- `levelup.banner` : 9-slice, wide (at least 320x96)

## 8. Game canvas assets (texture atlases)

Delivered as sprite sheets (PNG + JSON, exported from a packer such as free-tex-packer). Max atlas size 2048x2048.

**Snake skins**: snakes move in free directions and bend smoothly, so a skin is not made of grid cells. Each skin is its own atlas named `skin.<id>`:
- `head`: one sprite facing right (the engine rotates it), 96x96 at 1x, plus `head.dead` and `head.boost`
- `eyes`: optional separate layer so eyes can look toward the steering direction
- `body.segment`: a round segment, 64x64, designed to overlap its neighbors by about 50% with no visible seams
- `body.segment.alt`: an alternate segment for patterns (stripes, alternating colors)
- `body.pattern`: optional seamless horizontal strip (256x64) that tiles along the length of the body, used instead of segments for rope-style rendering
- `tail.tip`: tapered end, 64x64
- Optional 4-frame idle animation for the head
- The body gets thicker as the snake grows, so all parts must scale cleanly (no 1px details)

**Pickups and arena:**
- `pellet.<color>`: small glowing pellets, 32x32, in 6-8 colors; `pellet.big` (dropped by dead snakes), 64x64, with an optional 4-frame glow pulse
- `arena.bg`: seamless 512x512 background tile, repeated and slightly parallaxed across the map
- `arena.border`: the circular boundary ring (seamless along its length)
- `arena.storm`: shrinking danger zone overlay or vignette, partly transparent
- Optional later: `powerup.speed`, `powerup.shield`, `powerup.magnet` (64x64)

**Effects (frame sequences):**
- `fx.death.burst` (8-12 frames), `fx.eat.pop` (6 frames), `fx.spawn.ring` (8 frames), `fx.boost.trail` (particle sprites emitted while boosting), `fx.trail.<id>` (cosmetic trail particles)

## 9. Backgrounds and logo

- `bg.menu`, `bg.lobby`, `bg.result`: 1080x1920 portrait, plus a safe-area guide (keep key art within the center 1080x1600)
- `logo.game`: transparent PNG, 1024px wide, plus a single-color version for splash screens
- App icon: 1024x1024, no transparency, no rounded corners (stores apply the mask)
- Splash screen: 2732x2732, important content within the center 1200x1200

## 10. Animation notes for UI

Hand off a short reference (video or GIF) for: button press squash, panel pop-in, reward count-up, chest opening, level-up banner. Timings go into the `motion.*` design tokens, so approximate durations are enough.

## 11. Delivery checklist

- [ ] Palette sheet (hex values) for token mapping
- [ ] All assets at @1x/@2x/@3x with the naming scheme above
- [ ] `.slice.json` for every 9-slice element
- [ ] Atlases with JSON data for snake skins and effects
- [ ] Fonts used (with license) or a font recommendation for `font.display` and `font.body`
- [ ] Source files delivered separately
- [ ] Written confirmation that all art is original or licensed for commercial use
