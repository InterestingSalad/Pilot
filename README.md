# 🐧 Arcade Sandbox

A blank static website to experiment with — seeded with one mini-game,
**Penguin Cannon**. No build step, no dependencies, no server required.

## Structure

```
index.html                     # Home — sandbox landing + game card
games/penguin-cannon.html      # Game page: top nav + centered 16:9 stage
assets/css/site.css            # Arcade theme, nav bar, layout, 16:9 stage
assets/js/penguin-cannon.js    # The game (canvas engine, physics, state machine)
assets/js/nav.js               # Shared nav: active link + dropdown toggle
```

## Penguin Cannon — how to play

One button does everything: **tap the stage** or press **Space / Enter**.

1. **Insert coin** to start (you begin with 5, saved in your browser).
2. **Lock the angle** — the cannon sweeps up and down; tap to set it.
3. **Lock the power** — the meter fills; tap to **fire**.
4. **In the air** — tap to **flap** (3 charges) for extra hang time, skip off
   the ground like a stone, and grab floating 🪙 rings for bonus coins.
5. Long throws refund coins (+1 per ~55 m), so good launches keep you playing.
   Out of coins? Tap for a free refill — it's a sandbox.

Press **M** to mute. High score + coins persist via `localStorage`.

## Run locally

Just open `index.html` in a browser. For clean relative paths, serve it:

```bash
python -m http.server 8000
# then open http://localhost:8000
```
