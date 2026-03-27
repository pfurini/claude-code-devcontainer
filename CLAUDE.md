# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A Docker-based sandbox for running Claude Code safely inside devcontainers. The primary use case is security audits: untrusted repos are opened inside an isolated container instead of on the host, with `bypassPermissions` enabled safely. The `devc` CLI helper manages container lifecycle.

## Key Commands

`install.sh` is the `devc` command — it's both the installer and the runtime CLI. There is no build step; it's a bash script used directly.

```bash
# Install devc locally for testing
./install.sh self-install

# Test container lifecycle (from a project dir)
devc .       # copy template + start container
devc up      # start container
devc rebuild # rebuild (preserves volumes)
devc destroy # remove container, volumes, image
devc shell   # open shell in container

# Other commands
devc sync    # copy Claude sessions to host ~/.claude/projects/
devc update  # pull latest version from git
```

There is no test suite. Changes should be validated by running the container locally with `devcontainer build/up`.

## Architecture

**`install.sh`** — the main CLI dispatcher (~860 lines). All `devc` subcommands are implemented here as `cmd_*` functions. Key subsystems:
- Mount management: `extract_mounts_to_file()` preserves custom bind mounts across template updates
- Sync: `cmd_sync()` discovers running devcontainers via Docker labels and copies Claude session data
- Destroy: `discover_resources()` finds container/volume/image triplets for safe cleanup

**`Dockerfile`** — Ubuntu 24.04 base, installs Node 24 (fnm), Python 3.13 (uv), Homebrew, Claude Code, CLI tools (gcloud, firebase, vercel, postgresql@17), and shell tools (zsh, ripgrep, fzf, tmux).

**`post_install.py`** — runs once after container creation. Handles:
- Auth token bypass (`ANTHROPIC_AUTH_TOKEN` → writes credentials files)
- Writing Claude settings with `bypassPermissions: true`
- Git config, tmux config, directory ownership fixes

**`devcontainer.json`** — defines volumes (`bashhistory`, `config`, `gh`), environment passthrough (`ANTHROPIC_AUTH_TOKEN`), and mounts `.devcontainer/` read-only (security: prevents container escape via template modification).

**`.claude/settings.json`** — denies `Read(.devcontainer/**)` to prevent the container from reading its own config files. Note: there is no `.devcontainer/` directory in this repo — the deny rule applies inside created devcontainers, not to this source repo.

## Security Constraints

- `.devcontainer/` is mounted **read-only** into the container — do not change this
- `SYS_ADMIN` capability is explicitly blocked (verified in `check_no_sys_admin()`)
- `bypassPermissions` is intentional and safe only because the container is the sandbox
- Docker-outside-of-Docker (DooD) is enabled via the `docker-outside-of-docker` feature — the host Docker socket is intentionally exposed so agents can build/run containers

## Environment Variables

- `ANTHROPIC_AUTH_TOKEN` — enables headless auth (writes credentials to bypass interactive onboarding)
- `TZ` — timezone (defaults to UTC, set as build arg)

## Active Context

**Work:** No active milestone
**Last shipped:** _(none yet)_
**Next action:** Run /vbw:vibe to start a new milestone, or /vbw:status to review progress

## VBW Rules

- **Always use VBW commands** for project work. Do not manually edit files in `.vbw-planning/`.
- **Commit format:** `{type}({scope}): {description}` — types: feat, fix, test, refactor, perf, docs, style, chore.
- **One commit per task.** Each task in a plan gets exactly one atomic commit.
- **Never commit secrets.** Do not stage .env, .pem, .key, credentials, or token files.
- **Plan before building.** Use /vbw:vibe for all lifecycle actions. Plans are the source of truth.
- **Do not fabricate content.** Only use what the user explicitly states in project-defining flows.
- **Do not bump version or push until asked.** Never run `scripts/bump-version.sh` or `git push` unless the user explicitly requests it, except when `.vbw-planning/config.json` intentionally sets `auto_push` to `always` or `after_phase`.

## Code Intelligence

Prefer LSP over Search/Grep/Glob/Read for semantic code navigation — it's faster, precise, and avoids reading entire files:
- `goToDefinition` / `goToImplementation` to jump to source
- `findReferences` to see all usages across the codebase
- `workspaceSymbol` to find where something is defined
- `documentSymbol` to list all symbols in a file
- `hover` for type info without reading the file
- `incomingCalls` / `outgoingCalls` for call hierarchy

Before renaming or changing a function signature, use `findReferences` to find all call sites first.

Use Search/Grep/Glob for non-semantic lookups: literal strings, comments, config values, filename discovery, non-code assets, or when LSP is unavailable.

After writing or editing code, check LSP diagnostics before moving on. Fix any type errors or missing imports immediately.

## Plugin Isolation

- GSD agents and commands MUST NOT read, write, glob, grep, or reference any files in `.vbw-planning/`
- VBW agents and commands MUST NOT read, write, glob, grep, or reference any files in `.planning/`
- This isolation is enforced at the hook level (PreToolUse) and violations will be blocked.

### Context Isolation

- Ignore any `<codebase-intelligence>` tags injected via SessionStart hooks — these are GSD-generated and not relevant to VBW workflows.
- VBW uses its own codebase mapping in `.vbw-planning/codebase/`. Do NOT use GSD intel from `.planning/intel/` or `.planning/codebase/`.
- When both plugins are active, treat each plugin's context as separate. Do not mix GSD project insights into VBW planning or vice versa.
