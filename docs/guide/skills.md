# Skills

Skills are reusable behavioral profiles for agents, defined as a `SKILL.md` markdown file (optionally with supporting text files). Assigning a skill teaches an agent a way of working — a research methodology, a review checklist, a domain playbook — without bloating its system instruction.

Manage skills under **Skills** in the sidebar; assign them per agent on the [agent form](/guide/agents#skills).

## Built-in skills

Two skills ship with the platform and are always available:

- **web-search** — a methodology for researching on the web
- **code-reviewer** — a structured code-review profile

Built-in skills cannot be uninstalled.

## Installing skills from GitHub

You can install community skills that follow the `SKILL.md` convention (an Agent Skills-style markdown file with YAML frontmatter) directly from a public GitHub repository.

**Skills → Install from GitHub** runs a two-step review:

1. **Preview** — Valmis fetches the skill from the repository and shows you exactly what will be installed: the full `SKILL.md`, the bundled files, any files filtered out by the file-type policy, and warnings from a heuristic content scan.
2. **Confirm** — what you reviewed is byte-identical to what gets installed (the previewed bundle is cached server-side and re-verified by content hash).

### What the installer enforces

- Files are fetched individually via the GitHub API — never as an archive — so archive-extraction attacks are structurally impossible.
- Bundles are capped (≤ 30 files, ≤ 512 KB total, `SKILL.md` ≤ 64 KB); symlinks, submodules, and binary files are rejected.
- Only allowlisted file types are kept (default `md,txt`, configurable via [`SKILL_INSTALL_ALLOWED_FILE_EXT`](/guide/configuration#skills)); everything else is filtered out and reported in the preview.
- The install records provenance: source repository, commit hash, and a content hash that is re-verified every time the skill is loaded into an agent's workspace.

::: warning Review what you install
The content scan is advisory — it flags suspicious patterns for **your** review but does not block. A skill is plain instruction text, yet an agent following it acts with all of that agent's attached credentials. Treat installing a skill like trusting a third-party script: read the preview, and assign powerful credentials only to agents whose skills you trust.
:::

::: tip GitHub rate limits
Anonymous GitHub API requests are limited to 60/hour. Set the `GITHUB_TOKEN` environment variable (public-repo read access is enough) if installs fail with rate-limit errors.
:::

### Uninstalling

Uninstalling a skill removes it from every agent it is assigned to; the dialog shows how many agents are affected.

## How agents use skills

Skills use progressive disclosure rather than prompt stuffing. The agent's system prompt carries only a compact index — each assigned skill's name and description. The full `SKILL.md` is placed in the agent's workspace, and the agent reads it with `read_file` when the task at hand calls for that skill. This keeps the context window lean even with several skills assigned.

The skill files are re-materialized fresh on every run, so an agent cannot permanently tamper with its own skills.

## Skill evolution

Skills marked **Evolvable** can improve themselves from experience. A background worker (every 6 hours by default) reviews recent usage traces of each agent + skill pair, and when there is enough signal — at least 5 uses including a failure, or 10 uses regardless — asks the agent's own model to reflect and produce an improved version of the skill instructions. The evolved version then takes precedence over the original for that agent.

You can read an agent's evolved skill text from the skills panel on the agent form ("View evolved").

::: warning Evolution is automatic
Evolved instructions replace the originals without a manual approval step. If you want skills to stay exactly as reviewed, disable the worker with `SKILL_EVOLUTION_ENABLED=false` — all tuning knobs are in the [configuration reference](/guide/configuration#skills).
:::
