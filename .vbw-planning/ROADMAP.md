# claude-code-devcontainer Roadmap

**Goal:** claude-code-devcontainer

**Scope:** 3 phases

## Progress
| Phase | Status | Plans | Tasks | Commits |
|-------|--------|-------|-------|---------|
| 01 | ✓ Built | 4 | 13 | 13 |
| 02 | ✓ Built | 3 | 7 | 3 |
| 03 | ✓ Built | 3 | 9 | 4 |

---

## Phase List
- [x] [Phase 1: Preset CLI](#phase-1-preset-cli)
- [x] [Phase 2: Plugin Support](#phase-2-plugin-support)
- [x] [Phase 3: Core Hardening](#phase-3-core-hardening)

---

## Phase 1: Preset CLI

**Goal:** Implement a CLI tool for configuring Claude Code with presets (settings, permissions, plugins)

**Requirements:** REQ-07

**Success Criteria:**
- CLI tool accepts preset name and applies configuration
- Presets cover common use cases (security audit, general dev, minimal)
- Existing devc workflow integrates with preset system

**Dependencies:** None

---

## Phase 2: Plugin Support

**Goal:** Add Claude Code plugin installation and management to the preset CLI, so presets can specify plugins to install from marketplaces

**Requirements:** REQ-08

**Success Criteria:**
- Preset JSON schema supports a `plugins` field with marketplace, name, and scope
- `claude-preset apply` installs specified plugins via `claude plugin install`
- `claude-preset remove` uninstalls plugins that were added by the preset
- Plugin state is tracked in `.preset-state.json` snapshots for clean removal
- Both v1 presets (nextjs, convex) are updated with relevant plugins if available

**Dependencies:** Phase 1

---

## Phase 3: Core Hardening

**Goal:** Improve container security, add testing, and set up CI/CD pipeline

**Requirements:** REQ-05

**Success Criteria:**
- Automated tests for install.sh functions
- CI pipeline runs on PR
- Security audit checklist passes

**Dependencies:** Phase 2
