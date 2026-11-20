---
name: work
description: Modify or clone one of the user's claude.ai artifacts from its entry in the tower's artifacts catalog, without redoing it from scratch. Use when asked to change, update, fix, extend, copy, fork or make a new version of an artifact, or when started by the artifacts gallery's "Modify with a worker" or "Clone with a worker".
---

# Work on an artifact

1. **Read its entry**: `tower read <tag>` (`tower kept artifacts` lists them). Its `## Summary` is how and why it was
   made; `## Prompts` are what the user asked for; its header names the chat's `transcript` and the local `file` it was
   published from, when they are on this machine. Read the transcript when the summary leaves a question open.
2. **Read the page**: the Artifact tool's `read` on its `url`. Build from that version, not from the local `file`,
   which may be older. When the read names a saved file that holds the full page, edit a copy of that. An entry with
   no `url` is a Cowork artifact never shared to claude.ai: its page lives only in Claude Desktop, so rebuild it from
   the entry, its transcript and the chat's outputs, and publish it as a new artifact.
3. **Ask** the user what to change, or what the new one is for, unless your prompt says.
4. **Publish**:
   - To modify, publish with its `url`: the link stays the same.
   - To clone, publish without `url`: a new artifact, the original left alone.

   The tower records the publish as you make it, and its hook asks you for the creation context: write it then with
   `tower x artifacts context <id> <<'EOF'` … `EOF`. For a clone, start from the original's summary and say what
   differs; for a change, update the summary only where what it is for or how it is built changed.
5. The publish hook keeps the page in the catalog (`<id>.html` in the tower-wide `artifacts.pages` collection) and
   shows it beside you, so don't also `tower show` the local file you published from. To show the user an artifact's
   page as it stands before you change it, `tower show` its kept page: `tower kept artifacts.pages` prints where each
   one is.
