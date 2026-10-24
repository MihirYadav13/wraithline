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

## Privacy

Wraithline counts how many people play and how contracts go, so we can tell what to fix. It
does **not** collect names, room codes, chat, IP addresses or anything else that identifies you.

- **Play stats** (only in builds where analytics is set up, see below): `game_loaded`,
  `contract_started` (map, difficulty, number of players), `contract_finished` (map, difficulty,
  whether the ghost guess was right, whether you died, minutes played, objectives completed),
  `quit_from_menu` (abandoned from the pause menu: map, difficulty, minutes),
  `mp_room_created` and `mp_room_joined`. They go to a cookieless analytics service (Plausible
  or Umami) that does not store IP addresses.
- **Multiplayer relay** keeps only counters: rooms created, joins and contracts started per day,
  and the peak number of players online.
- **Feedback** is sent only when you press *Send* in the feedback form: your 1-5 rating, your
  comment, the map and difficulty (from the results screen) and the game version.

**Opting out:** untick *Share anonymous play stats* under Settings on the main menu. The choice is
saved in your browser (`localStorage`) and applies from then on, including the next time you
load the game.

## Analytics and feedback setup

Nothing is sent unless these are set at build time (for example in a `.env.production` file next
to `package.json`, which Vite reads during `npm run build`). With none of them set, as in
`npm run dev`, the game makes no analytics or feedback requests at all.

| Variable | Meaning |
| --- | --- |
| `VITE_ANALYTICS_PROVIDER` | `plausible`, `umami` or `custom` |
| `VITE_ANALYTICS_URL` | The script URL from your provider's tracking snippet (e.g. `https://plausible.io/js/script.js`), or for `custom` the URL to POST `{ event, props, version }` to |
| `VITE_ANALYTICS_SITE_ID` | Plausible: the site's domain as registered. Umami: the website ID |
| `VITE_FEEDBACK_URL` | Where the feedback form POSTs JSON `{ rating, text, from, map, difficulty, version }`, e.g. `https://<relay host>/mp/feedback` or a Formspree form endpoint |
| `VITE_FEEDBACK_LINK` | Fallback link shown in the form (Discord invite or the itch.io page). The *Send feedback* buttons are hidden when neither feedback variable is set |

Events are sent straight to the provider's collection API (`/api/event` for Plausible,
`/api/send` for Umami); no third-party script is loaded into the page.
Each player's browser sends its own events, so in multiplayer one contract shows up once per
player; the relay's `contractsStarted` counts team games. The `VITE_*` values end up in the
public game bundle, so never put a secret there (the stats token stays on the server).

**Plausible:** create an account at plausible.io (or self-host), add a site whose domain is
the one you put in `VITE_ANALYTICS_SITE_ID` (e.g. `yourname.itch.io`). Under *Site settings →
Goals* add a custom-event goal for each event name above, and under *Custom properties* add
`map`, `difficulty`, `players`, `correct`, `died`, `minutes` and `objectives_done` so they can be
broken down.

**Umami:** create a website in Umami Cloud or your own instance and copy its website ID and
script URL. Events and their properties show up under *Events* with no extra setup.

**Relay stats and feedback inbox** (environment variables on the server that runs the relay):

| Variable | Meaning |
| --- | --- |
| `WRAITHLINE_STATS_TOKEN` | Enables `GET /mp/stats`. Read it with `curl -H "Authorization: Bearer <token>" https://<host>/mp/stats` |
| `WRAITHLINE_STATS_FILE` | Optional path to keep the counters (and recent feedback) across restarts |
| `WRAITHLINE_FEEDBACK_FILE` | Optional path; each feedback entry is appended as one JSON line |
| `WRAITHLINE_FEEDBACK_WEBHOOK` | Optional Discord channel webhook URL; each feedback entry is posted there |

`POST /mp/feedback` is open when at least one of those four is set; the last 100 entries, the
rating histogram and the average rating are included in `/mp/stats`. It accepts at most five
entries per address per ten minutes; addresses are only held in memory for that limit.

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
| `server/stats.js` | Relay usage counters, `/mp/stats` and the `/mp/feedback` inbox |
| `src/analytics.js`, `src/feedback.js` | Anonymous play events, the opt-out toggle and the feedback form |

The menu has a **Graphics** setting; use *Low* on integrated GPUs (it disables bloom and the moon shadow and lowers the render resolution).
