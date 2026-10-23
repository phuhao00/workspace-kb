# workspace-kb promo (Remotion)

Short README explainer: one MCP engine shared by Cursor · Codex · WorkBuddy (`up` → `install-clients` → reload MCP).

Alt text used in READMEs:

- EN: `One engine, three clients: up → install-clients → reload MCP`
- ZH: `一引擎三端：up → install-clients → 重载 MCP`

## Preview

```bash
cd promo
npm install
npm run dev
# open Composition "ThreeClients"
```

## Re-export GIF for README

Writes `docs/media/three-clients.gif` (~7s @ 30fps, scale 0.75, every 2nd frame → ~700–850KB; keep under 1MB):

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

Use a free `--port` if 3000/3124 is already taken.

Root `npm run smoke` (also `.github/workflows/smoke.yml`) asserts the GIF path exists and `promo` still points at it — no Remotion install required in CI.

## Edit

- Composition: `src/ThreeClients.tsx`
- Registration: `src/Composition.tsx` (`id="ThreeClients"`, 960×540 @ 30fps, 210 frames)
