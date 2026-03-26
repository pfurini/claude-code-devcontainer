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
