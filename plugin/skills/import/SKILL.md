---
name: import
description: Import the user's claude.ai artifacts into the tower's artifacts catalog, from Claude Desktop (Cowork) and the claude.ai gallery, each with a summary of how it was made. Use when the user says "import my artifacts", "bring my Claude Desktop artifacts in", "sync the artifacts gallery", or "summarize my artifacts".
---

# Import artifacts

The catalog is the tower-wide `artifacts` collection: one entry per artifact, with its link, where it came from, and
its creation context. You fill it from two sources.

## 1. Claude Desktop's Cowork artifacts

```sh
tower x artifacts desktop
```

The tower reads them on this machine, each with the chat that made it: its title, transcript and prompts. Run it again
any time: it refreshes entries and keeps pins and summaries.

## 2. The claude.ai gallery

The tower can't reach claude.ai; you can. List the gallery with the Artifact tool (`action: "list"`, `scope: "mine"`,
a high `limit`, following `next_page_token`), then add each one:

```sh
tower x artifacts add --url https://claude.ai/artifact/<id> --title '<title>' --updated <yyyy-mm-dd>
```

An artifact already in the catalog (one a worker published, or a Cowork one) is refreshed, not doubled.

## 3. The summaries

`tower kept artifacts` lists the entries; `tower read <tag>` reads one. For each entry whose `## Summary` says none is
written yet, write one:

- If its entry names a `transcript`, read it: that is the chat that made it. Summarize what was asked and why, the
  sources and data it drew on, the choices made and what was ruled out.
- Otherwise read the page with the Artifact tool (`action: "read"`) and say what it is, what it is for, what it draws
  on and how it is built, and that the chat that made it isn't on this machine.

```sh
tower x artifacts context <id> <<'EOF'
…
EOF
```

Write it for the worker who will next modify or clone it with nothing else in hand. With many entries, ask the user
whether to summarize all of them or the ones they pin first. Don't pin for them: pins are the user's.
