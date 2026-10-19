# Wraithline

A first-person, single-player ghost-hunting investigation game that runs in the browser.
It's inspired by the co-op ghost-hunting genre (Phasmophobia and similar). Nothing is taken
from Phasmophobia: furniture and surface materials are CC0 (public-domain) scans from
[Poly Haven](https://polyhaven.com) (see `public/assets/CREDITS.md`); the ghost, equipment,
van and buildings are modelled in code; and all audio is synthesised live with the Web Audio API.

## Maps

| Map | Description |
| --- | --- |
| **14 Willow Lane** | Single-storey family home: hallway, master bedroom, bathroom, nursery, kitchen, dining and living room. Picket fence, front yard. |
| **Pine Hollow Cabin** | Log cabin in a forest: log walls, plank ceilings, wall sconces, wood stove, iron bed frames, bunk room, porch and a fire pit. Clear starry sky, green fog, owls. |
| **St. Agnes Sanatorium** | Abandoned hospital wing in the snow: long corridor of flickering fluorescent tubes, patient ward, nurse station, padded cell, morgue. |

Pick the map on the main menu. Willow Lane has rain, lightning and thunder.

## Multiplayer (same Wi-Fi, up to 4 players)

1. The host starts the game with `npm run host` instead of `npm run dev`. Vite prints a
   **Network** address such as `http://192.168.1.20:5173`. If Windows asks, allow Node.js on
   **private** networks.
2. Everyone opens that Network address in Chrome (the host can use it too).
3. Type a name. The host clicks **Host game** and reads out the 4-letter code; friends type it and
   click **Join**.
4. The host picks the map and difficulty and clicks **Start investigation**.

The host's browser runs the ghost; keep it open (it keeps running in the background). Everyone
has their own sanity and journal; hunts trigger on the team's average sanity. If you die you
keep drifting around as a spirit. Anyone alive can end the contract from the van laptop.
Playing over the internet needs the game hosted on a server (not set up yet).

## Run it

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Vite opens http://localhost:5173 (use `npm run host` for multiplayer, see below). Click **Start investigation** and the mouse is captured
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
| `src/level.js` | Map engine: grid-based walls, doors, windows, lights, yard, van, pathfinding, static mesh merging |
| `src/maps/*.js` | Map definitions: room layout, doors, windows, furniture, exterior |
| `src/assets.js` | Loads the Poly Haven textures/models and simplifies dense meshes at load time |
| `src/ghost.js` | Ghost model and AI (wandering, interactions, apparitions, hunts) |
| `src/ghostTypes.js` | Evidence, ghost types and their modifiers |
| `src/items.js` | Equipment models and behaviour |
| `src/player.js` | First-person movement and collision |
| `src/audio.js` | Procedural sound engine (footsteps, creaks, whispers, spirit box, hunts, ambience) |
| `src/textures.js` | Procedural canvas textures |
| `src/ui.js` | HUD, journal and menus |
| `src/viewmodel.js` | First-person hand, arm and flashlight |
| `src/net.js`, `src/multiplayer.js`, `src/avatar.js` | Multiplayer client, world sync and teammate characters |
| `server/relay.js` | WebSocket relay used for multiplayer (attached to the Vite server) |

The menu has a **Graphics** setting; use *Low* on integrated GPUs (it disables bloom and the moon shadow and lowers the render resolution).
