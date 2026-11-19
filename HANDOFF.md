# Handoff: Math Quest (family learning apps)

You're taking over a project built over a long series of cloud sessions. You'll work locally on the
parent's Windows PC, which can reach the kids' Raspberry Pis directly. Read this whole file before
you change anything.

## What this is

A family of kid-friendly, gamified practice apps: plain HTML/CSS/JS, no build step, no backend. It
lives in the GitHub repo `m-mccaffrey/long-division` (branches `main` and
`claude/long-division-practice-app-3g5rg5` are kept identical; GitHub Pages serves `main`). It now
also runs as a **desktop app on two Raspberry Pis**, which is how the kids use it.

### The kids

| Pi | Login | Kid | Profile |
|---|---|---|---|
| `192.168.5.181` | `june` | June, ~10, bright | **older** |
| `192.168.5.40` | `mikey` | Mikey, younger (the "son" in earlier requests) | **younger** |

**The parent pays the kids $1 per badge.** That shapes everything: never create a way to earn
badges cheaply, and never let progress or badges be lost or re-earnable by accident.

### Connecting to the Pis

Raspberry Pi 400s, Raspberry Pi OS 11 Bullseye (32-bit), Python 3.9, Chromium (`chromium-browser`).
SSH key at `~/.ssh/id_ed25519` on the PC is authorized on both, and sudo needs no password. Use
Windows' built-in OpenSSH (Git Bash's ssh is too old):

    C:\Windows\System32\OpenSSH\ssh.exe -o BatchMode=yes june@192.168.5.181

## Repo layout

- `index.html` + `script.js` + `style.css` at the root: **Long Division Quest**.
- One folder per quest, each with `index.html`, `script.js`, `style.css`:
  - Visible math quests: `addition-subtraction`, `datetime1`/`datetime2` (Time & Calendar),
    `multiplication1`/`2`, `money1`/`2`, `rulers1`/`2`, `angles1`/`2`, `number-sentences`.
  - `character/`: the "My Character" page (name, avatar, levels and badges across all quests).
  - Hidden on purpose (reachable by URL only, linked from nowhere, and they don't count toward
    rank): `baseball`, `scriptquest` (screenplay "translation", language arts), `lifequest` (life
    skills). The parent asked for these to be hidden; don't re-link them unless asked.
- `shared/path.js` + `shared/path.css`: the progression system (see below), used by every math quest
  and by the Character page.
- `shared/store.js`: desktop persistence shim (see below), first script in every page's `<head>`.
- `desktop/`: `server.py`, `import_chromium.py`, `install.sh`, `icon.svg`.

Paired quests share one save (`timeCalendarQuestState`, `multiplicationQuestState`,
`moneyQuestState`, `rulersQuestState`, `anglesQuestState`), so XP and level are shared, but each page
has its own path and its own 15 badges.

## Conventions

- Cache-busting: pages load `style.css?v=N` / `script.js?v=N` / `../shared/path.js?v=N`. Bump N
  whenever a file changes. (The desktop server sends `no-store`, but the website still relies on this.)
- Quest engine pattern: `DIFFICULTY` tiers, `POOLS[tier]` of generator functions returning
  `{category, visualHTML, promptText, inputs, check, correctSummary, hint}`, plus `registerSolve` /
  `registerMiss` / `addPoints`. Guided vs. Free mode; Free gives +15% XP.
- Commit messages explain the why. Push to both branches. **Test before shipping**: the past
  sessions used Node `vm` sandboxes to brute-force generators (every problem has exactly one correct
  answer, no NaN or undefined, integers where promised) plus Playwright for end-to-end checks.
- The parent prefers to be shown a design and asked when a decision is genuinely theirs (kids'
  feelings, money), and otherwise wants you to use judgment and make it better rather than follow
  suggestions literally.

## The progression system (`shared/path.js`) — read it before touching difficulty or badges

There's no difficulty picker anymore (kids farmed Easy). Each quest picks the tier per problem along
a **path**: Easy → Medium mixed in gradually → all Medium → Hard mixed in → all Hard → mastery.
Correct answers add +1 progress, misses take −1. `PATH_CONFIG` holds each quest's tiers and badge
categories. Per-page state lives in `stats.paths[id]`.

- **15 badges per quest page**, spread along the path. Category badges need 5 solves on Medium or
  harder. The capstone "Master" badge needs the end of the path plus every other badge, except the
  optional "Free Thinker" (Free Mode). A simulation confirmed all 15 land by mastery.
- **Carry-over** (`carryOver`): players with history from before the path existed start with Medium
  already mixing in, and the quick early badges are pre-awarded and marked **"carried over"** (grey,
  ✔️). The parent doesn't pay for those.
- **Older profile** (`localStorage.mathQuestPlayerProfile = "older"`): locks the five "1" quests
  (a lock screen points to the "2" version, and their links are removed everywhere), and sets
  starting floors in `OLDER_FLOORS` (add/sub 22, number sentences 18, long division 0). Floors only
  ever move progress forward, misses can't drop below them, and badges under a floor are carried
  over. On the website this was set with `?player=older`; on the Pis the installer writes it into
  the save file.
- Celebrations: a new badge gets a big gold "🏅 New badge!" banner and full confetti; every
  5-in-a-row streak gets a small "🔥 N in a row!" note (skipped right after a badge).

## Desktop app on the Pis

Installed per user by `desktop/install.sh` (already run on both Pis; the output showed all progress
imported correctly):

- App files: `~/math-quest/app/` (a copy of the repo minus `desktop/`), plus `server.py`,
  `import_chromium.py`, and the `math-quest` launcher in `~/math-quest/`.
- **Progress: `~/.local/share/math-quest/save.json`** (the source of truth), with
  `backups/save-YYYY-MM-DD.json` (one per day, last 30 kept). The app's own Chromium profile is
  `~/.local/share/math-quest/browser/`.
- `server.py`: Python standard library only, binds `127.0.0.1:8765`, serves the app, and handles
  `GET`/`PUT /api/save` with atomic writes. The launcher starts it if it isn't running, then opens
  `chromium-browser --app=http://127.0.0.1:8765/character/index.html`.
- `shared/store.js`: on localhost it synchronously loads `save.json` into localStorage before any
  quest script runs, then writes every change back (debounced). It does nothing on the public site.
- Desktop shortcut: `~/Desktop/math-quest.desktop` (also in `~/.local/share/applications`), with
  PCManFM `quick_exec=1` so it launches without an "Execute?" prompt.
- `import_chromium.py` read the kids' old progress out of Chromium's LevelDB for origin
  `https://m-mccaffrey.github.io`. The install imports **only on first install**; re-running it to
  update never overwrites app progress. The import also brought along a few harmless keys from the
  parent's other projects on the same origin (`cube_logic.save.v1`, `mealPlannerData.v1`,
  `terrarium-planner:current`, `gtx_fb_sid`) and Mikey's legacy `money1QuestState`/`money2QuestState`.
  The quests ignore all of these.

**To update a Pi** after pushing changes to `main` (progress is kept):

    ssh.exe -o BatchMode=yes june@192.168.5.181 "cd /tmp && rm -rf long-division-main && curl -sL https://github.com/m-mccaffrey/long-division/archive/refs/heads/main.tar.gz | tar xz && bash long-division-main/desktop/install.sh --player older"

(Use `mikey@192.168.5.40` and `--player younger` for Mikey.) If you change `server.py`, also kill the
running server (`pkill -f "math-quest/server.py"`) so the next launch picks it up.

## Before touching a kid's data

- Back up `~/.local/share/math-quest/save.json` before any change that could touch it.
- Never reset or remove badges or progress without asking the parent; badges are money.
- The server must stay bound to `127.0.0.1` only.

## Not yet verified / open items

- No one has watched the desktop shortcut get double-clicked on a real Pi. Ask the parent, or check
  over SSH (with `DISPLAY=:0` for the logged-in session).
- The server only starts when the shortcut is clicked. A systemd `--user` service would be sturdier
  if that ever matters.
- Ideas the parent liked but hasn't greenlit: a "Life Sim" (month-by-month RPG) built on Life Quest;
  surprise-expense and roommate twists in the budget builder.
- Life Quest is about 37 px too wide on phones (it's hidden, so this is low priority).
