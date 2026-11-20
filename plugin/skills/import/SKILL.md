---
name: import
description: Import the user's claude.ai artifacts into the tower's artifacts catalog, from Claude Desktop (Cowork) and the claude.ai account, each with its page and a summary of how it was made. Use when started as `/artifacts:import`, or when the user says "import my artifacts", "bring my Claude Desktop artifacts in", "sync the artifacts gallery", or "summarize my artifacts".
---

# Import artifacts

The catalog is the tower-wide `artifacts` collection: one entry per artifact (`<id>.md`: its link, where it came
from, its creation context) and its page (`<id>.html` in the tower-wide `artifacts.pages` collection), which the
gallery shows. Work through the steps
without stopping to ask, then report.

- **Started as `/artifacts:import list`** (the extension's first load): steps 1, 2 and 4 only. Pages and summaries
  cost one Artifact read each, so they wait for the user, who asks from the gallery.
- **Otherwise** (the gallery's **Import my claude.ai account**, or the user asking): all four steps.

## 1. Claude Desktop's Cowork artifacts

```sh
tower x artifacts desktop
```

The tower reads them on this machine, each with the chat that made it. It refreshes entries and keeps pins and
summaries, so running it again is safe.

## 2. The claude.ai account

The tower can't reach claude.ai, but you can. List every artifact with the Artifact tool (`action: "list"`,
`scope: "mine"`, `limit: 200`, following `next_page_token` until there is none), then add each one:

```sh
tower x artifacts add --url https://claude.ai/artifact/<id> --title '<title>' --updated <yyyy-mm-dd>
```

An artifact already in the catalog is refreshed, not doubled.

## 3. Each page and its summary

`tower kept artifacts` lists the entries; `tower read <tag>` reads one. For every entry with a `url` that has no page
yet (no `<id>.html` in `tower kept artifacts.pages`) or no summary:

1. Read it with the Artifact tool (`action: "read"`, its `url`). When the result names a saved file holding the
   full page, keep that file. When it gives the HTML inline, write it to a file in your scratchpad first. Then:

   ```sh
   tower x artifacts page <id> --file <that file>
   ```

2. If the summary says none is written yet, write one. If the entry names a `transcript`, read it: that is the chat
   that made the artifact, so summarize what was asked and why, the sources and data it drew on, and the choices made
   and what was ruled out. Otherwise, say from the page what it is, what it is for, what it draws on and how it is
   built, and that the chat that made it isn't on this machine.

   ```sh
   tower x artifacts context <id> <<'EOF'
   …
   EOF
   ```

Write each summary for the worker who will next modify or clone the artifact with nothing else in hand. Take the
entries one at a time, so a long import keeps what it has done.

## 4. Report

Say how many artifacts came in from each source, how many pages and summaries you kept, and which ones failed and
why. Don't pin anything: pins are the user's. Don't `tower show` every page either: the gallery shows them, and the
user opens the ones they want.
