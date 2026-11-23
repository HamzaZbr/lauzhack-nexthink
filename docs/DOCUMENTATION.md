# Sparky: documentation

> Built solo in one weekend (21–22 November 2026) for the **Nexthink challenge at LauzHack 2026**, EPFL.
> Result: **Top 4 in the Nexthink track**. The jury added this spot to recognise a solo project.
> The project started under the name *Preflight*, which is why some code, folders and the `PREFLIGHT_*` settings still use that name. The app's interface is in French; UI labels are quoted below with an English translation.

## Contents

1. [The problem](#1-the-problem)
2. [What Sparky does](#2-what-sparky-does)
3. [How it works](#3-how-it-works)
4. [Safety model](#4-safety-model)
5. [The LLM: what it sees, what it returns, which model](#5-the-llm-what-it-sees-what-it-returns-which-model)
6. [Code map](#6-code-map)
7. [Setup and configuration](#7-setup-and-configuration)
8. [Getting good results: briefs and calendar invites](#8-getting-good-results-briefs-and-calendar-invites)
9. [Demo walkthrough](#9-demo-walkthrough)
10. [Troubleshooting](#10-troubleshooting)
11. [What's real, what's simulated, what's next](#11-whats-real-whats-simulated-whats-next)

## 1. The problem

Most tech problems at work are **never reported**. A slow laptop right before a call, weak Wi-Fi, no HDMI adapter in your bag, an update that lands at the worst moment: people sigh, work around it and move on. IT only sees tickets, so this friction stays invisible.

Sparky addresses it **before** it happens. It starts from your **calendar** (what you are about to do), not only from the state of the machine.

Target user: an office worker on their own laptop, with a day full of meetings and focus blocks.

## 2. What Sparky does

Sparky is a small dog that peeks over the bottom edge of the screen. Its eyes follow the mouse and you can drag it anywhere. Click it to start your day; right-click for a menu.

| When | What happens |
|---|---|
| **Morning brief** | You describe your day in one sentence. An LLM places your tasks in the free slots between calendar events, with the apps, sites and documents each task needs. Sparky lists what to take with you (HDMI adapter, charger). |
| **5 min before each block** (meeting or focus block) | **Pre-flight**: checks the Mac against what the block needs (external screen if you present, Wi-Fi, battery on long blocks), proposes to quit heavy apps (300 MB or more) and close tabs unrelated to the block, and opens what the block needs: Zoom directly in the app, the document cited in the invite (found with Spotlight), the right GitHub tab, pre-filled meeting notes. |
| **Free slot** | **Coffee break**: measures and cleans rebuildable caches (npm, pip, Homebrew, Gradle, Xcode, Spotify) and moves old downloads to the Trash. |
| **Any time** | **Shortcuts**: repeated click routines become one global key (⌃⌥P presentation, ⌃⌥R report, ⌃⌥T spreadsheet, ⌃⌥N meeting notes) that open company templates. |
| **6 pm** | **End-of-day recap**: time saved, actions taken, GB freed, problems caught, what's left (carried over into tomorrow's brief), and what to pack for tomorrow. |

The dashboard (second click on Sparky) has five pages: **Today** (timeline), **My PC** (machine state + a "why" graph linking blocks to apps and tabs), **Shortcuts**, **Journal** (every action with its reason, and Undo), **Week** (totals computed from the journal).

## 3. How it works

### 3.1 The three parts of the Electron app

```
┌──────────────────────────────┐         IPC messages         ┌──────────────────────────────┐
│  MAIN (Node.js)              │  ◄────────────────────────►  │  RENDERER (React)            │
│  src/main/                   │                              │  src/renderer/src/           │
│                              │        ┌──────────────┐      │                              │
│  - reads the Mac (sensors)   │        │  PRELOAD     │      │  - dashboard (5 pages)       │
│  - runs actions              │ ◄────► │  src/preload │ ◄──► │  - pop-ups, Sparky           │
│  - calls the LLM             │        │  window.api  │      │  - NO direct access to the   │
│  - schedules everything      │        └──────────────┘      │    machine                   │
└──────────────────────────────┘                              └──────────────────────────────┘
```

- **Main** is the only part allowed to touch the machine (run `ps`, quit an app, call the LLM API).
- **Renderer** is the UI. It can only *ask* main, through `window.api`.
- **Preload** exposes a closed list of functions to the page (`contextBridge`). Nothing else gets through, so even a misbehaving page can only call those functions.

All windows load the same React bundle; the URL hash picks the screen (`#/app/today`, `#/popup/preflight`, `#/mascot`…).

### 3.2 Scheduler

Every 15 seconds `scheduler.ts` checks the (demo-adjustable) clock:

- 8 min before a block: tab triage starts in the background (so the slower, more accurate model is ready in time);
- 5 min before a block: the pre-flight pop-up opens and Sparky announces it;
- start of a free slot: coffee break;
- 18:00: end-of-day recap;
- day change: calendar reloaded, yesterday's tasks dropped, leftovers offered in the next brief.

### 3.3 A pre-flight, step by step

```
Pop-up (React)                 Main (Node)                          The Mac
──────────────                 ───────────                          ───────
planPreflight() ─────────────► planner.ts
                               │ next block = "Pitch, 12:30"
                               │ takeSnapshot() ──────────────────► pmset, df, vm_stat, ps,
                               │                                    system_profiler, AppleScript (Chrome)
                               │ ◄──────────────────────────────── battery, disk, RAM, Wi-Fi,
                               │                                    displays, apps, tabs
                               │ needs check + rules + LLM tab triage
◄──────────────────────────────┘
shows actions with reason
and risk level

[Prepare (3)] ───────────────► actions.ts  runActions()
                               for each action:
                               1. is the tool in the catalogue?
                               2. is the target valid? (app running, not protected, safe URL)
                               3. dry run? → "simulated"   else → execFile (osascript / open)
                               4. write to the journal, keep the undo function
◄──────────────────────────────┘
"done / simulated / failed"    → journal and dashboard update live
```

While the pop-up is open, the external display is re-checked every 3 s, so plugging in a screen turns the red alert green without reopening anything.

### 3.4 The morning brief

1. You type, for example, *"finish the Q4 report in Excel at 2pm, review PR #42 on GitHub"*.
2. `agent.ts` computes your free slots from the calendar.
3. The LLM receives your sentence, the calendar blocks, the free slots, the apps available and a **JSON schema** it must follow.
4. It returns blocks such as `{ "title": "Finish Q4 report", "start": "14:00", "end": "16:00", "apps": ["Excel"], "sites": [], "docs": ["budget_q4"] }`, plus needs (`internet`, `display`, `gear`).
5. The code **checks every block**: valid times, inside a free slot, no overlap. Anything else is dropped.
6. If the LLM fails (error, more than 12 s, nothing valid), a rule-based fallback creates one 45-min block per part of the sentence.

### 3.5 Tab triage

1. The LLM gets the next block (title, time, apps, invite description), the other blocks of the day, one sentence about you (`USER_CONTEXT`), what it learned from you (sites you always keep or often close), and one line per tab: `12 | youtube.com | lofi beats | (active)`.
2. Tabs are sent in batches of 25, in parallel. A batch that fails keeps all its tabs.
3. The LLM returns **only the tabs to close**, with a reason: `{ "close": [{ "i": 12, "reason": "music video unrelated to the budget review" }] }`. Short answers are faster and rarely cut off.
4. `tabs.ts` then applies hard guardrails (see §4).
5. The same decision (cached 5 min) colours the graph on *My PC* and fills the pop-up, so both always agree.
6. Learning: unticking a tab marks its site "keep"; closing marks it "closable". This is given back to the LLM next time.

### 3.6 Needs of each block

`src/shared/needs.ts` reads each block (invite text + LLM fields) and derives:

- **internet**: video link, "online", GitHub… → Wi-Fi checked at T-5;
- **external display**: "present", "projector", "pitch in front of"… → a screen must be plugged in at T-5 and an HDMI adapter goes in the bag the evening before. *"Prepare the pitch"* does **not** count as presenting;
- **battery**: blocks of 90 min or more → plug in below 50 %;
- **gear**: HDMI, charger, headset, USB key → "in your bag".

These checks are read-only: Sparky warns, it never changes anything for them.

### 3.7 Shortcuts

`resources/usage-demo.json` is a **simulated** week of app usage. `detectRoutines()` counts click sequences repeated at least 3 times a week (a deterministic count, not the LLM) and proposes a shortcut for each. Shortcuts run through the same action registry, so they are logged and undoable. Templates belong to an invented company, *Lémanic SA*. On a Mac without Office, Excel/Word/PowerPoint map to Numbers/Pages/Keynote.

## 4. Safety model

1. **The LLM proposes, the code decides.** The LLM only returns JSON. It can only pick tools from a closed catalogue (`actions.ts`); it never runs a command.
2. **Every target is validated**: only apps that are actually running can be quit; system apps and developer tools are protected; only https, Teams, Zoom and Webex links are opened; cache cleanup uses a closed list of folders.
3. **Three risk levels**:
   - `auto`: read-only checks, always run;
   - `confirm`: reversible, ticked by default, runs only when you click;
   - `ask`: never ticked by default (quitting Word, emptying the Trash, updates).
4. **No shell.** Commands run with `execFile` and separate arguments, so a strange app name cannot inject another command.
5. **Tab guardrails in code**, whatever the LLM says: the active tab, the meeting link, mail, documents relevant to the block and known work sites (GitHub, Stack Overflow, docs, `*.epfl.ch`, arXiv, Hugging Face, Notion, tutorial videos…) are never closed. If one copy of a page is kept, no copy is closed. At most 40 tabs per run. `WORK_SITES` adds your own.
6. **Everything is logged** with its reason, and everything reversible can be undone: apps and tabs reopen, created files go to the Trash.
7. **Simulation by default** (`PREFLIGHT_DRY_RUN=1`). The only tools that run in simulation are the ones that *create* a new file (`new_from_template`, `meeting_notes`), since they never modify anything that exists.
8. **Privacy**: `TABS_SEND_TITLES=0` sends only site names to the LLM, not tab titles. Preferences and the journal stay local.

## 5. The LLM: what it sees, what it returns, which model

- Provider: **Together AI**, serverless models, OpenAI-compatible API with strict `json_schema` responses.
- **Brief**: `zai-org/GLM-5.2`, chosen because it is interactive and must be fast (about 0.6–0.8 s).
- **Tab triage**: `openai/gpt-oss-120b`, chosen for accuracy. It runs 8 min ahead, so its ~4 s are invisible.
- Reasoning is turned off by default (`LLM_REASONING=0`): some models otherwise spend the whole output budget "thinking" and return an empty answer.

`npm run bench:llm` measures this on 25 hand-labelled tabs (2 runs each):

| Model | Serious errors (closes a work tab) | Misses | Time |
|---|---|---|---|
| `openai/gpt-oss-120b` | 0 | 0 | ~4 s |
| `zai-org/GLM-5.2` | 1 (closes a Stack Overflow question) | 0.5 | 0.8 s |
| DeepSeek-V4.1-Flash | 1.5 | 1 | 0.8 s |
| Qwen3.5-9B | 2 | 2 | 1.0 s |

## 6. Code map

### `src/main/`: the brain (Node.js)

| File | Role |
|---|---|
| `index.ts` | Startup, menu bar icon, IPC handlers, global shortcuts |
| `windows.ts` | Dashboard, pop-ups and the transparent Sparky window (cursor tracking, dragging) |
| `sensors.ts` | Reads the Mac with read-only commands → `DeviceSnapshot` |
| `actions.ts` | Acts on the Mac: tool catalogue, risk levels, validation, execution, journal, undo |
| `planner.ts` | Builds the pre-flight plan from the next block and the snapshot |
| `llm.ts` | Together AI client, forces JSON that follows a schema |
| `agent.ts` | Morning brief and tab triage, with validation and fallbacks |
| `tabs.ts` | Tab guardrails: what the LLM is *allowed* to close (pure functions) |
| `prefs.ts` | Local learning (`prefs.json`): sites kept/closed, carry-over for tomorrow, shortcuts |
| `day.ts` | The day: calendar blocks + brief tasks + free slots |
| `clock.ts` | App clock, adjustable for demos (including "tomorrow 08:30") |
| `calendar.ts` | Loads the calendar (ICS link, file or demo), reloads every 10 min and on day change |
| `ics.ts` | Parses `.ics`: recurrences, Outlook time zones, Teams/Zoom links, attendees, meeting vs focus block |
| `scheduler.ts` | Triggers triage, pre-flight, coffee break, recap |
| `workspace.ts` | Finds cited documents with Spotlight (`mdfind`), brings useful tabs to the front |
| `cleanup.ts` | Measures rebuildable caches, Trash and old downloads |
| `installed.ts` | Which apps are really installed (Office → Apple apps, missing Teams removed) |
| `documents.ts` | Company templates and pre-filled meeting notes in `~/Documents/Preflight` |
| `shortcuts.ts` | Global shortcuts, run through the action registry |

### `src/shared/`: pure logic shared by main and UI

| File | Role |
|---|---|
| `types.ts` | All data shapes (block, action, snapshot, journal entry) |
| `needs.ts` | Needs of each block and the checks at T-5 |
| `shortcuts.ts` | Shortcut definitions and routine detection |
| `apps.ts` | Protected apps, document apps, app name aliases |
| `tree.ts` | The "why" graph (blocks → apps → tabs by site) |
| `week.ts` | Weekly totals and the "time saved" assumptions |

### `src/renderer/src/`: the UI (React)

| File | Role |
|---|---|
| `main.tsx` | Picks the screen from the URL hash |
| `App.tsx` | Sidebar, header, pages |
| `views/` | `Today`, `MyPc`, `Shortcuts`, `Journal`, `Week` |
| `popup/Popup.tsx` | Morning brief, pre-flight, coffee break, end-of-day recap |
| `mascot/Mascot.tsx` | Sparky (SVG, moods, eyes following the cursor) |

### `resources/`

Demo calendars (`demo.ics`, `outlook-preflight-22-23nov.ics`), company templates, a demo spreadsheet, the simulated usage log.

## 7. Setup and configuration

```bash
npm install
cp .env.example .env    # add your Together AI key
npm run dev             # only Sparky shows up, bottom-right
npm run demo:tabs       # optional: a Chrome window of demo tabs
npm run bench:llm       # optional: compare models on labelled tabs
```

macOS will ask for permission to control Chrome (System Settings → Privacy & Security → Automation). `.env` is only read at startup: restart after changing it.

| Setting | Recommended | Purpose |
|---|---|---|
| `TOGETHER_API_KEY` | your key | LLM access |
| `TOGETHER_MODEL` | `zai-org/GLM-5.2` | Brief model |
| `TOGETHER_TABS_MODEL` | `openai/gpt-oss-120b` | Tab triage model |
| `PREFLIGHT_DRY_RUN` | `1` (testing), `0` (real actions) | Simulation switch |
| `USER_CONTEXT` | one sentence about you | Tells the LLM what counts as work for you |
| `CALENDAR_ICS_URL` / `CALENDAR_ICS_FILE` | optional | Your real calendar (secret ICS link) or a local file; otherwise the demo calendar |
| `TABS_SCOPE` | `front` for demos | Only look at the front Chrome window |
| `TABS_SEND_TITLES` | `1` | `0` = send only site names to the LLM |
| `WORK_SITES` | optional | Extra sites that are never closed |
| `PREFLIGHT_START` | unset | `dashboard` = open the dashboard at launch instead of Sparky alone |

The journal is saved in `~/Library/Application Support/lauzhack-nexthink/journal.json`. Delete it (with the app closed) to reset the weekly numbers.

## 8. Getting good results: briefs and calendar invites

### Writing the morning brief

1. One task per part, separated by commas.
2. Name the tool or site: "in VS Code", "on GitHub", "in Excel".
3. Give a time or duration if you know it: "at 2pm", "1h". Otherwise the LLM estimates 30–120 min.
4. Name the document: "the budget_q4 file".

| Vague | Better |
|---|---|
| work on the project | 2h on the project at 2pm: train the model in VS Code, read 2 arXiv papers |
| do exercises | 45 min of ML exercises on Moodle at 4pm |
| emails | 30 min of email in Outlook before 9am |

⌘+Enter sends the brief.

### What Sparky reads in a calendar invite

| In the invite | Sparky deduces |
|---|---|
| Teams / Zoom / Meet / Webex link | The app to open + a "Join" button (Zoom opens directly in the app) |
| `budget.xlsx`, "Excel", ".pptx", "slides", ".docx" | The app, and the file searched on the Mac |
| An agenda | Given to the LLM to decide which tabs are relevant |
| "present", "projector", "pitch in front of" | External screen checked at T-5, HDMI adapter in the bag |
| "HDMI", "charger", "headset" | Added to "in your bag" |
| A video link, "online", "GitHub" | Wi-Fi checked at T-5 |
| A link or 2+ attendees | It's a meeting (pre-filled notes); otherwise a focus block |

Real ICS links from Google or Outlook can take minutes to hours to update. Use the « recharger » (reload) button above the timeline, or the demo calendar.

## 9. Demo walkthrough

1. Set `PREFLIGHT_DRY_RUN=0` and `TABS_SCOPE=front`, point `CALENDAR_ICS_FILE` to `./resources/outlook-preflight-22-23nov.ics`, run `npm run demo:tabs`, open Spotify, then `npm run dev`.
2. Click Sparky → write your day → tasks placed between meetings, "in your bag: HDMI adapter, charger".
3. Clock → 5 min before the pitch → pre-flight: ⚠ no external screen → plug it in → ✓ within 3 s. Spotify and unrelated tabs closed, work tabs kept.
4. Focus block "prepare the presentation" → "Create the presentation from the company template", or press ⌃⌥P.
5. 18:00 → recap: time saved, what's left, what to pack.
6. Journal → Undo any action. Set `PREFLIGHT_DRY_RUN=1` again afterwards.

The app clock resets to the real time on every restart: use the demo buttons in the sidebar to jump back.

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Sparky doesn't appear | Window hidden | Menu bar icon → « Afficher la mascotte » (show mascot), or `PREFLIGHT_START=dashboard` |
| "AI unavailable: empty answer" | The model "thinks" too long | `npm run bench:llm`, switch model |
| "AI unavailable: timeout" | Slow model or network | Change `TOGETHER_TABS_MODEL`, check Wi-Fi |
| No pre-flight opens | No upcoming block | Do the brief, or use the demo calendar |
| Tabs "not read" | Chrome automation denied | System Settings → Privacy & Security → Automation |
| Actions say "simulated" | Dry run is on | `PREFLIGHT_DRY_RUN=0`, restart |
| ⌃⌥P does nothing | Key taken by another app | The Shortcuts page says so; use « Essayer » (try) or Sparky's right-click menu |
| Anything else | — | Terminal running `npm run dev` (`[llm]`, `[raccourci]` lines), and ⌘+⌥+I in the window |

## 11. What's real, what's simulated, what's next

**Real on the Mac**: sensors, calendar parsing, LLM brief and tab triage, quitting apps, closing tabs, opening Zoom/documents/templates/notes, cache cleanup, needs checks with live display detection, undo, journal.

**Simulated**: the usage log behind the shortcuts (demo data), the macOS update, and "time saved" (an estimate; the assumptions are shown in the app, e.g. 5 min per problem caught, 6 s per tab).

**Known limits**: macOS only; Chrome only for tabs; the demo clock resets on restart.

**Next steps**: Microsoft Graph for calendar and M365 signals in production; real usage data instead of the simulated log; an aggregated view for IT (what hurts the company most, ranked by hours lost); Windows support.
