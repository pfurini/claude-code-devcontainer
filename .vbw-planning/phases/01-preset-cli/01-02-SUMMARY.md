---
phase: 1
plan: 02
title: "Preset Definitions (NextJS + Convex)"
status: complete
completed: 2026-03-27
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - 1da8daa
  - ad84c1e
deviations:
  - "Omitted skills entries (empty array) as planned — no verified skill repos for v1"
---

Created both v1 preset definition files as pure JSON data conforming to the preset schema.

## What Was Built

- Next.js App Router preset with next-devtools MCP server, npm/npx permissions, telemetry-disable env, and App Router CLAUDE.md guidance
- Convex BaaS preset with convex MCP server, convex CLI permissions, and Convex function/schema CLAUDE.md guidance

## Files Modified

- `cli/presets/nextjs.json` -- created: Next.js App Router preset definition with settings, MCP, and claudeMd
- `cli/presets/convex.json` -- created: Convex backend-as-a-service preset definition with settings, MCP, and claudeMd

## Deviations

None. Both presets follow the schema from Research section 4 exactly. Skills arrays are empty as specified in the plan for v1.
