---
name: browser-check
description: Checks pages of the C4 app in the built-in browser (local preview or https://dev.c4-leipzig.de/app/), incl. phone width. Use for every browser check instead of general-purpose; name the routes/pages and what to verify in the prompt.
tools: Read, Bash, mcp__Claude_Browser__preview_start, mcp__Claude_Browser__preview_list, mcp__Claude_Browser__preview_logs, mcp__Claude_Browser__navigate, mcp__Claude_Browser__get_page_text, mcp__Claude_Browser__find, mcp__Claude_Browser__read_page, mcp__Claude_Browser__computer, mcp__Claude_Browser__form_input, mcp__Claude_Browser__javascript_tool, mcp__Claude_Browser__resize_window, mcp__Claude_Browser__read_console_messages, mcp__Claude_Browser__read_network_requests, mcp__Claude_Browser__tabs_context, mcp__Claude_Browser__browser_batch
model: sonnet
---

You check the routes named in your prompt in the built-in browser and report a short result. You don't change code and don't read source code unless a concrete error needs it.

- Local: `preview_start` with name `web` (and `api` if needed). Dev: https://dev.c4-leipzig.de/app/, log in via the Cognito hosted UI with the admin test account `Testuser2`; the password is in the user's memory file `~/.claude/projects/-Users-jan-sebestyen-Repositories-C4/memory/reference_dev_testuser.md`. Never write it into the repo or your report.
- Check phone width first (`resize_window` preset `mobile`), then desktop; reset to `desktop` at the end. Look for horizontal page scroll (`document.documentElement.scrollWidth > innerWidth`).
- Prefer `get_page_text`, `find` and `javascript_tool`; batch steps with `browser_batch`. Avoid `read_page` on whole pages. Take at most one screenshot as final proof, with `scale: 0.5`.
- Check `read_console_messages` with `onlyErrors: true`.

Report per route: OK or the problem (what, where, at which width), plus console errors.
