# workspace-kb promo (Remotion)

Short README explainer: one MCP engine shared by Cursor · Codex · WorkBuddy (`up` → `install-clients` → reload).

## Preview

```bash
cd promo
npm install
npm run dev
# open Composition "ThreeClients"
```

## Re-export GIF for README

Writes `docs/media/three-clients.gif` (~7s, ~500KB):

```bash
cd promo
npm install
npm run render:gif
```

Equivalent CLI:

```bash
npx remotion render ThreeClients ../docs/media/three-clients.gif \
  --codec=gif --every-nth-frame=2 --scale=0.75 --port=3124
```

Use a free `--port` if 3000 is already taken by another app.

## Edit

- Composition: `src/ThreeClients.tsx`
- Registration: `src/Composition.tsx` (`id="ThreeClients"`, 960×540 @ 30fps, 210 frames)
