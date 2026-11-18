# Rocket Strike — Meteor Run

A self-contained arcade shooter built with HTML5 Canvas. Fly the rocket, blast meteors,
and chain hits for combo multipliers.

## Play

**https://2nithing.github.io/rocket-strike/**

Or open `index.html` in a modern browser. No build step or dependencies required.

## Controls

- **Arrow keys / WASD** — move
- **Space** (hold) — fire
- **P / Esc** — pause
- **R** — restart
- **M** — sound on/off
- **Enter** — launch / retry

On touch screens: drag to fly, hold to auto-fire.

## Scoring

- Large meteors are worth 20, medium 35, small 55 points.
- Destroyed rocks split into smaller ones — clear the debris for more points.
- Consecutive hits build a combo, raising your score multiplier up to **x6**.
- Getting hit costs a life and resets the combo. A shield protects you briefly after a hit.
- Waves get faster and busier every 18 seconds. Your best score is saved locally.

## Notes

The older racing game in this workspace (`racing-game/`) is not part of this deployment.
