# X5 Commander: green monochrome radar look

The target look is a military radar screen with phosphor glow: one green hue at different brightness levels, glowing wireframes on black, afterglow trails and scanlines. Enemy types are told apart by shape, brightness and blinking, not by color.

## Context for a fresh session
- The game is built and playable: `npm run dev`. `npm test` runs a headless check of the game logic; `npm run build` type-checks and builds.
- The original game plan is in [plan-mvp.md](plan-mvp.md); controls and scripts are in [README.md](README.md).
- Files:
  - [src/config.ts](src/config.ts) holds every number: enemies, upgrades, perks, difficulty.
  - [src/sim.ts](src/sim.ts) is the pure game logic, with no Three.js. It emits `s.events` for rendering and sound.
  - [src/render.ts](src/render.ts) is the Three.js scene. It uses one `InstancedMesh` per enemy type and pooled shards, shockwave rings and beams.
  - [src/hud.ts](src/hud.ts) + [src/style.css](src/style.css) + [index.html](index.html) are the DOM HUD, the canvas mini radar, the shop and the overlays.
  - [src/sfx.ts](src/sfx.ts) synthesizes sound with WebAudio. [src/main.ts](src/main.ts) handles the game loop and input.
- **This is visual work only. Do not touch `sim.ts`.** `npm test` must stay green.
- Current colors to replace:
  - `CYAN`, `GREEN`, `MAGENTA`, `YELLOW` constants in `render.ts`;
  - per-enemy `color` values in `config.ts`;
  - CSS variables in `style.css`;
  - hard-coded hex colors in `hud.ts` (mini radar).
- Visual check: the scratchpad from the last session had a Playwright screenshot script. Playwright's Chromium is in `~/.cache/ms-playwright/chromium-1234`, and `playwright-core` has to be installed outside the repo. Launch it with `--use-angle=swiftshader`.

## Open decisions (ask first, or use the defaults)
1. **Pure green, or green plus one alert color?** Default: keep **amber** as the only exception, for warnings and base damage. A hit on the base is too easy to miss in pure mono.
2. **Font.** Default: the **system monospace** font, so the game stays free of external assets. The alternative is a Google font such as *Share Tech Mono*, which looks more futuristic but is an external download.

## 1. Palette (one place)
- Put one small set of green tokens in `config.ts`, shared by the 3D scene and the CSS:
  `dim #0b3d1f · mid #1f9e4f · bright #39ff88 · hot #c8ffe0` (near-white green for flashes and hits), plus `alert #ffb000` if decision 1 keeps amber.
- Remove the cyan, yellow, magenta and per-enemy orange/red colors.
- Show threat level through behavior instead of color:
  - elites and tanks blink;
  - locked targets get the brightest shade;
  - critical HP makes the HUD flicker and invert.

## 2. 3D scene (`render.ts`)
- **Bloom and CRT effect.** Use `EffectComposer` + `UnrealBloomPass` from `three/examples/jsm` (they ship with three, so no new dependency). Add one small custom shader pass for scanlines, vignette, a slight lens curve and faint noise.
- **Wireframe everything.** Enemies, the base and projectiles become glowing edges (`EdgesGeometry`) with a nearly black fill, replacing the current flat-shaded solids. Enemies need an instanced edge mesh per type, e.g. `InstancedMesh` with a wireframe geometry.
- **Polar grid ground.** Draw it once to a `CanvasTexture`: range rings with distance labels, bearing ticks every 10° with 000–350 labels, and a fine noise pattern. It costs nothing per frame.
- **Radar sweep.** A sharp bright leading line with a long afterglow tail over the full circle. Each enemy the sweep passes leaves a fading blip ghost where it was detected (a pooled instanced blip), so you see blip jumps like a real radar, not smooth motion.
- **Target markers.**
  - Locked targets get corner-bracket reticles `⌐ ¬` and a small label such as `TGT-042 · 038m` (pooled DOM labels projected to the screen, or sprites).
  - The target you marked gets a rotating reticle and a dashed line to the base.
- **Effects.** Explosions become expanding wireframe rings plus a few line shards. The shockwave from a hit on the base briefly lights up the whole grid.

## 3. HUD (`hud.ts`, `style.css`)
- **Monochrome styling.**
  - All panels green on black, with thin 1px borders and corner brackets instead of full boxes.
  - Glowing text, uppercase monospace, CSS scanline overlay, and a faint flicker.
- **Mini radar.** Draw it in the same style so it matches the main view, with afterglow drawn by fading the previous frame instead of clearing it.
- **New system log (bottom left).** A 5-line scrolling feed, updated at most a few times a second:
  - `> CONTACT BRG 047 RNG 41`
  - `> LOCK TGT-042`
  - `> PWR LOW – SWEEP 60%`
- **Readout for the marked target.** Shows its bearing, range, HP and ETA to the base.
- **Boot sequence on the start screen.** Lines type out one by one, e.g. `X5 DEFENSE NODE ONLINE… RADAR CALIBRATED…`, then `DEPLOY`.
- **Bars.** Change the solid bars into segmented ones, e.g. `▮▮▮▮▮▯▯▯`.

## 4. Sound (`sfx.ts`)
- Add a soft ping on every sweep revolution and a short blip when a contact is detected.

## Order
Keep the game runnable after each step.
1. Palette, then wireframe materials. This already gets about 70% of the effect for the least code.
2. Bloom and the CRT pass.
3. Polar grid texture, then the new sweep and blip ghosts.
4. HUD restyle, then the system log and target readout.
5. Boot sequence and sound.

## Done when
- The whole screen reads as one green radar display, plus amber if kept.
- All 5 enemy types are distinguishable without hue.
- `npm test` and `npm run build` pass, and the screenshots look right.
