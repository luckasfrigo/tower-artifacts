# Artifacts

A catalog of your claude.ai artifacts in the tower: everything in Claude Desktop and your claude.ai account,
imported on first load, and every artifact your workers publish from then on. Each one keeps its page and the
context it was made in, so any worker can modify or clone it without starting over. The ones you pin stay on top.

## What it adds

- **The sidebar:** an **Artifacts** tab after Floors and Stats, which opens the gallery. It's also in the palette.
- **The main pane:** the gallery. Pinned artifacts come first, then the rest, newest first, searched by title,
  description, summary and who made it. Click one to see its link, the worker, floor or Desktop chat that made it,
  its creation context and the whole chat that made it, in two tabs: **Page** draws its kept page in place, in a sandboxed frame
  whose scripts reach neither the tower page nor its API (**Expand** puts the list away; **Fetch page** has a worker
  keep a page that isn't here yet), and **Context** holds how it was made: the summary and the chat, each prompt
  with the answer its turn ended on, read from the chat's transcript as it stands when you open the tab (the prompts
  the entry kept are shown when the transcript isn't on this machine). From there you can open it on
  claude.ai, pin it, or hire a worker on a floor you pick to
  **modify** it (same link) or **clone** it (a new artifact). The worker starts from the entry.

  | Light | Dark |
  | --- | --- |
  | ![The gallery](shots/gallery-light.png) | ![The gallery](shots/gallery-dark.png) |

- **The workers:** a Claude hook on the Artifact tool. Each time a worker publishes a page, the hook records it with
  its link, title, local page, the worker, the floor and the chat's prompts, keeps the page, shows it beside the
  worker as `tower show` does (Claude Code also opens it in the browser, which no hook can stop), and asks the worker
  to write the creation context while it still holds it. Two skills ship with it: `artifacts:import` and
  `artifacts:work`. A second hook, on each prompt, shows an artifact the prompt refers to beside the worker, as
  `tower show` does, and tells the worker which entry it is. A claude.ai link or an entry's tag is shown at once, and
  so is a title when the prompt holds only one; when it holds several, nothing is shown and the worker asks the user
  which one is meant. A prompt about an artifact already there ("open the smile artifact", "show me this artifact")
  matches by a word of its title, the worker's own artifacts first, or else the artifacts the worker made (one is shown, several are asked about). The hook reads the catalog's folder directly, so a prompt about nothing else costs no call to the tower. For a looser
  reference still, the guidance has the worker find it and show it, or ask, and never open it with the Artifact
  tool's `open`, which goes to the browser. What `tower whoami` shows:

  ```
  artifacts  ·  claude.ai artifacts catalog: each one you publish is recorded; write its context when asked (`tower x artifacts context`). `tower kept artifacts` lists them, `tower read <tag>` one.
  ```

- **The CLI:** `tower x artifacts desktop | add | page | context | pin | unpin`, and `tower kept artifacts` /
  `tower read <tag>` for the entries, `tower kept artifacts.pages` for their pages. A kept page is a file a worker can
  `tower show`.

Tower 3D and The Week draw nothing of it.

## Add it

Clone this repo anywhere, then name its folder in the config:

```json
{ "extensions": { "artifacts": { "path": "/path/to/tower-artifacts" } } }
```

**First load.** The first time the tower runs the extension, it imports Claude Desktop's Cowork artifacts on this
machine. It also hires one worker, on the `floor` setting's floor or the board's first, to list your claude.ai account
and add every artifact. Only an interactive Claude session has the Artifact tool, and only that tool reaches claude.ai.
The first load stops at the list: pages and summaries cost one Artifact read each, so they're yours to ask for. Use
**Fetch page** on one artifact, or **Import my claude.ai account** for all of them. The hire is logged in the
extension's `loads` stream, so it happens once; a failure is logged and waits for the gallery's buttons.

The hook and skills reach sessions that start after the extension is added; a running worker doesn't get them.

## What it needs from you

- `desktop`: Claude Desktop's data folder, `~/Library/Application Support/Claude` by default, where its Cowork
  `artifacts.json` files and the chats that made each artifact are kept.
- `floor` (optional): the floor the first load hires its import worker on.

## How it works

- **Entries** are files in the tower-wide `artifacts` collection, named by the artifact's id, so one artifact is one
  entry whoever records it. `<id>.md` holds a `# Title`, a JSON header (`url`, `source`, dates, `pinned`,
  `callsign`, `project`, `file`, `chat`, `transcript`), then `## Summary` (written by a worker) and `## Prompts`
  (taken from the chat). The page is `<id>.html` in a second tower-wide collection, `artifacts.pages`, so a listing of
  either shows each artifact once (pages kept beside the entries by an older version are moved there when the extension
  starts). Recording or importing again refreshes an entry and keeps
  its pin and summary. A later change by another worker keeps the original chat's prompts.
- **Server** (`server.ts`): the verbs that write entries, the `page/<id>` read that serves a kept page (`serves:
  "file"`), the `chat/<id>` read that gives the whole chat from the entry's transcript, and the first load. A later
  publish from the same chat refreshes the entry's prompts; one from another chat keeps them. It reads only local files, never the network.
- **Plugin**: `hooks/record.mjs` passes each Artifact publish (never a read, a list or an asset upload) to
  `tower x artifacts record`, `tower show`s the kept page and hands the answer back to the worker as context;
  `hooks/refer.mjs` shows what a prompt refers to.
- **Client**: `gallery.ts` (the view), `tab.ts`, `commands.ts` (the palette's entry) and `artifact.ts` (the entry
  format, which the server shares).
- **The tab** is a view in the page's sidebar strip (`board.strip`) that draws nothing there. It places a button of
  its own after the page's side tabs, which it finds by their `data-side-view`, because the tower page has no region
  for extensions there. It holds the strip, which shows one view at a time. If the page changes that markup, the tab
  stops appearing and the gallery stays in the palette.

**Where the context comes from:** a worker's chat and a local Cowork chat are on this machine, so their prompts are
read directly and a worker writes the summary. A Cowork artifact made in a cloud session, and one from a claude.ai
chat, have no transcript here, so their summary is written from the page.

## Develop

The package is an ES module (`"type": "module"`): without it the tower loads the server as CommonJS, which caches
every module by path, so a restart runs the new `server.ts` over the old `client/artifact.ts`. `npm install`, then `npm run types` (writes `.tower/`, the tower's library declarations), `npm run typecheck` and
`npm run check` (the manifest, as the tower loads it).

## Pictures

`npm run tool:extension-shots -- /path/to/tower-artifacts` from a tower checkout, using the made-up entries in
`shots/seed/`.
