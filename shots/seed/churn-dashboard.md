# Churn Signals Dashboard

```json
{
  "url": "https://claude.ai/artifact/Ex4mpleChurn01",
  "source": "tower",
  "created": "2026-11-12T15:04:00.000Z",
  "updated": "2026-11-14T10:20:00.000Z",
  "pinned": true,
  "description": "Weekly churn risk by plan and cohort, with the five signals that move it most.",
  "callsign": "ATLAS-21",
  "project": "lab",
  "file": "/tmp/lab/out/churn.html"
}
```

## Summary

For the customer success leads' Monday review: which accounts are drifting, and why. Built from the `events_weekly` export (Sep–Nov) joined to plan data; the five signals are the ones with the largest lift in last quarter's model. A cohort heatmap was tried and dropped for a ranked table: the leads asked for names, not shapes. Static HTML, one inline SVG chart, no external scripts.

## Prompts

> Build a dashboard of churn signals the CS leads can read on Monday

> Rank accounts, don't show a heatmap. Keep it to five signals.
