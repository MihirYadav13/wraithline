# Wraithline

A first-person, single-player ghost-hunting investigation game that runs in the browser.
It's inspired by the co-op ghost-hunting genre (Phasmophobia and similar), but every model,
texture and sound is original: geometry is built from primitives, textures are painted on
canvases at load time, and all audio is synthesised live with the Web Audio API. There are
no asset files.

## Run it

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Vite opens http://localhost:5173. Click **Start investigation** and the mouse is captured
(press Esc to pause). Headphones are strongly recommended — sound is positional.

For a production build: `npm run build`, then `npm run preview`.

## How to play

1. You start in the investigation van. Read the whiteboard (ghost's name + optional objectives)
   and grab up to three pieces of equipment from the rack.
2. Head into the house and find the ghost's room — it gets cold, things move, lights die.
3. Collect evidence. Each ghost type leaves exactly three of these six:

   | Evidence | How to get it |
   | --- | --- |
   | EMF Level 5 | EMF Reader near ghost activity reads 5 |
   | Spirit Box | In the dark near the ghost, turn it on and ask questions [R] — it answers |
   | Fingerprints | Handprints on doors / light switches, visible only under the UV Flashlight |
   | Ghost Writing | Drop the Writing Book in the ghost's room and wait |
   | Freezing Temps | Thermometer reads below 0 °C |
   | Ghost Orbs | Floating lights only visible through the Video Camera's night vision |

4. Log evidence in your journal [J] and pick the ghost type.
5. Go back to the van and use the laptop to end the contract. Pay depends on a correct answer,
   completed objectives and whether you survived.

Sanity drains in the dark. Below the ghost's threshold it may **hunt**: the front door slams
and locks, lights flicker, and it comes for you. Break line of sight, turn off electronics,
hide behind closed doors. A Crucifix near the ghost stops a hunt from starting; Incense blinds
a hunting ghost or calms it for a while; Sanity Pills restore 40%.

### Controls

| Key | Action |
| --- | --- |
| WASD / Shift / C | Move / sprint / crouch |
| Mouse | Look |
| E | Pick up, doors, light switches, laptop |
| F or right-click | Use held item (power on/off, take pills, light incense) |
| R or left-click | Item action (ask the Spirit Box a question) |
| G | Drop held item |
| 1-3, Q, wheel | Switch inventory slot |
| T | Flashlight |
| J | Journal |

## Ghost types

Spirit, Wraith, Phantom, Poltergeist, Banshee, Jinn, Mare, Revenant, Shade, Demon, Yurei, Oni —
each has its own evidence set and behaviour (hunt threshold, speed, activity, how hard it
throws things). Read about them in the journal.

## Code map

| File | What it does |
| --- | --- |
| `src/main.js` | Game loop, input, sanity, hunts, van monitors, rain, end-of-contract report |
| `src/level.js` | The house (grid-based walls, doors, windows, lights, furniture), yard, van, pathfinding, static mesh merging |
| `src/ghost.js` | Ghost model and AI (wandering, interactions, apparitions, hunts) |
| `src/ghostTypes.js` | Evidence, ghost types and their modifiers |
| `src/items.js` | Equipment models and behaviour |
| `src/player.js` | First-person movement and collision |
| `src/audio.js` | Procedural sound engine (footsteps, creaks, whispers, spirit box, hunts, ambience) |
| `src/textures.js` | Procedural canvas textures |
| `src/ui.js` | HUD, journal and menus |

The menu has a **Graphics** setting; use *Low* on integrated GPUs.
