---
phase: 2
plan: 02
title: "Preset JSON Updates"
status: complete
completed: 2026-03-27
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - da76806
deviations: []
---

## What Was Built

Updated both v1 preset JSON files to include the new `plugins` and `marketplaces` fields, establishing schema consistency for the plugin support feature:

- **nextjs.json**: Added `plugins` array with `typescript-lsp@claude-plugins-official` entry (scope: project), empty `marketplaces` object, and bumped version to 2.0.0
- **convex.json**: Added empty `plugins` array (no Convex-specific plugin available), empty `marketplaces` object, and bumped version to 2.0.0

## Files Modified

| File | Change |
|------|--------|
| `cli/presets/nextjs.json` | Added `plugins` array with typescript-lsp entry, `marketplaces: {}`, version bump 1.0.0 -> 2.0.0 |
| `cli/presets/convex.json` | Added `plugins: []`, `marketplaces: {}`, version bump 1.0.0 -> 2.0.0 |

## Deviations

None. All tasks completed as specified in the plan.
