---
name: change-ui
description: Build or change KingSnake UI, ui-kit components, design tokens or art assets. Use for React screens, the HUD, theming, 9-slice art or icons.
---

# Change the UI

- Reusable components: `packages/ui-kit/src`, exported from `index.ts`, shown in `apps/client/src/Gallery.tsx`.
- Screens: `apps/client/src` (`App.tsx`, `OnlineApp.tsx`, `AccountUi.tsx`, `RankedUi.tsx`). HUD stats go through Zustand stores in `store.ts`.
- Game drawing is Pixi in `apps/client/src/game/Renderer.ts` and `Effects.ts`, not React.

Rules:

- Use `token('color.accent')`, never raw values. Motion comes from `motion.*` tokens.
- A new token means updating the `Theme` interface and every theme in `packages/design-tokens/src/index.ts`.
- Art resolves as: `skin` prop → manifest entries under the component's prefix → token CSS (`resolveSkin` in `skin.ts`). Every asset lookup can return `undefined`, so keep the fallback.
- Art drops in through `packages/assets/assets.manifest.ts` only, with no screen changes. Read `ART_SPEC.md` for naming and 9-slice rules. New asset names go in `packages/assets/src/types.ts`.
- Touch and mouse both matter: the client ships to web, Android and iOS.

Check it at `http://localhost:5173/#ui`, including the "Try demo art" toggle, then use the `verify` skill.
