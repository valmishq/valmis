# Web Browser

Agents can drive a **real web browser** — open pages, read them, fill in forms, register accounts, click through multi-step flows, and take screenshots. This lets an agent work with sites that have no API: booking pages, dashboards, contact forms, and anything else a person would do in a browser.

The browser runs **on the server**, separate from the agent's sandbox — the agent never runs a browser itself. It sends browsing commands to the platform, which drives the browser and sends back the results.

## Requirements

The browser is available for an agent only when **both** of these are true:

1. **The feature is enabled for your deployment.** An administrator sets `BROWSER_FEATURE_ENABLED=true` (off by default). See [Configuration](#configuration-for-administrators).
2. **The agent has internet access.** The agent's [**Allow internet access**](/guide/agents#allow-internet-access) toggle is **On**.

When both hold, the agent gains the browser tools and a **Browser** option appears in each conversation's menu. If either is off, the browser is completely unavailable to that agent — this is enforced on the server, not just hidden in the UI.

::: tip Why tied to internet access?
A browser is a way onto the internet. An agent with internet access **Off** is meant to be network-isolated, so it cannot browse. Turning browsing on for such an agent would defeat the purpose.
:::

## What the agent can do

You don't call these yourself — the model decides when to use them as it works on your request. Each call and its result appears inline in [chat](/guide/chat), just like other tools.

| Tool                 | What it does                                                                       |
| -------------------- | ---------------------------------------------------------------------------------- |
| `browser_navigate`   | Opens a URL and waits for the page to finish loading.                              |
| `browser_snapshot`   | Lists the interactive elements on the current page (links, buttons, fields).       |
| `browser_click`      | Clicks an element.                                                                 |
| `browser_type`       | Types text into a field (optionally pressing Enter to submit).                     |
| `browser_select`     | Chooses an option from a dropdown — native or custom.                              |
| `browser_press_key`  | Presses a key (Enter, Tab, Escape, arrow keys, …).                                 |
| `browser_screenshot` | Captures a picture of the page. You see it in chat; it can also be saved to files. |
| `browser_read_page`  | Returns the readable text of the page.                                             |
| `browser_wait_for`   | Waits for content to appear or the page to settle after an action.                 |
| `browser_go_back`    | Goes back to the previous page.                                                    |
| `browser_go_forward` | Goes forward again.                                                                |

A few things the browser handles well:

- **JavaScript-heavy and single-page apps.** Pages that render their content with JavaScript are fully loaded before the agent reads them.
- **Embedded forms.** Forms and widgets inside an `<iframe>` (for example a Tally, HubSpot, or Typeform embed) are visible and operable — the agent doesn't need to hunt for the embed's URL.
- **Custom dropdowns.** Both native `<select>` menus and custom combobox/listbox dropdowns work.
- **Screenshots you can see.** A screenshot taken by the agent is shown right in the conversation, and (if the agent saves it) lands in the agent's file [workspace](/guide/tools#files) so it can be reused later.

If a page genuinely can't be operated — a CAPTCHA, or a login wall the agent has no credentials for — the agent will tell you instead of looping forever.

## Staying logged in

The browser **remembers logins between conversations**, per agent. When the agent signs into a site, its cookies and site storage are saved, so the next time that agent browses, it's still signed in. You can see which sites an agent is logged into, and clear them, from the [browser menu](#managing-the-browser).

Within a single conversation, the browser also **stays open across messages**. If the agent navigates somewhere and you reply with a follow-up ("now take a screenshot", "click the second result"), it continues from the same page rather than starting over. The browser is closed automatically when:

- the conversation has been idle for a while,
- you delete the conversation, or
- a maximum session time is reached.

::: info Saved logins are per agent, not per conversation
Cookies, logins, and history belong to the **agent** and are shared across all of that agent's conversations. Only the live browser session itself is tied to the conversation you opened it from.
:::

## Browsing history

As the agent visits pages, the platform keeps a short **history** of the URLs it opened (most recent first). You can view this list and clear it from the browser menu. History is kept per agent.

## Managing the browser

Open any conversation with a browser-capable agent, hover a conversation in the left list, and open its **⋯ menu → Browser**. A panel opens with everything you can manage:

| Action                           | What it does                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Close session**                | Quits the live browser for **this conversation** right now. (Shows "no active session" if it was already closed.) |
| **Clear saved logins & cookies** | Signs the agent out everywhere by deleting its saved cookies and site storage. The next browse starts logged out. |
| **View / Clear history**         | Shows the agent's recent browsing history and lets you erase it.                                                  |
| **Reset everything**             | One click to do all of the above — close the session, clear logins/cookies, and clear history. A clean slate.     |

The panel also shows, at a glance, the current page of any active session, the sites the agent is logged into, the number of saved cookies, and when they were last saved.

::: warning These actions affect the whole agent
Clearing logins/cookies or history applies to the agent across **all** its conversations, not just the one you opened the menu from. Closing the session only affects the current conversation. Clearing and reset ask for a second click to confirm.
:::

## How it works (and why it's safe)

- **The browser is separate from the agent.** It runs in its own place on the server — in production, a dedicated, locked-down browser container; the agent's own sandbox never runs a browser. The agent only sends commands ("open this URL", "click element 3") and receives results.
- **Logins are kept out of the agent's reach.** Saved cookies live in a server-only location that is **never** exposed to the agent's files or tools — so the agent can stay logged in without being able to read or leak its own session cookies. See [Security Overview](/guide/security).
- **Each conversation is isolated.** Different conversations use separate browser sessions, so one agent's activity doesn't bleed into another's.
- **Hard on/off switch.** Browsing is allowed only when the feature is enabled and the agent has internet access — checked on the server for every action, so revoking an agent's internet access takes effect immediately.

## Good to know

- **The browser is a last resort, not the default.** For ordinary pages and data, the agent fetches the content directly (which is faster and cheaper) and only opens the browser when a site genuinely needs JavaScript rendering or interaction — forms, logins, clicking through steps, screenshots. If you specifically want the browser used, just ask for it.
- **Browsing uses several steps.** Reading, clicking, and typing are separate actions, so a longer task can reach the agent's per-turn limit and stop with a reply. Because the browser stays open, just send a follow-up message and it picks up where it left off.
- **Be considerate.** Use browsing for tasks you'd reasonably do yourself. Don't ask an agent to bypass logins it isn't authorized for, defeat anti-bot protections, or scrape sites at abusive volume.

## Configuration (for administrators)

Browsing is **off by default**. To turn it on, set `BROWSER_FEATURE_ENABLED=true`. In the standard Docker Compose deployment that's all that's required — the platform pulls the browser image and runs it on a dedicated network the moment the feature is enabled.

| Variable                          | Default                               | Description                                                                                                                        |
| --------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `BROWSER_FEATURE_ENABLED`         | `false`                               | Master switch. When off, no browser image is pulled, no browser runs, and no agent sees the browser tools or menu.                 |
| `BROWSER_MODE`                    | `auto`                                | `auto` runs the browser in a container in Docker deployments and in-process for bare-metal/dev. Force with `container` or `local`. |
| `BROWSER_IMAGE`                   | `ghcr.io/browserless/chromium:latest` | The browser container image (container mode).                                                                                      |
| `BROWSER_NETWORK`                 | `valmis_browser`                      | Dedicated Docker network for the browser. Agents are never on it, so they can't reach the browser directly.                        |
| `BROWSER_MAX_CONCURRENT_SESSIONS` | `10`                                  | Maximum simultaneous browser sessions across all agents.                                                                           |
| `BROWSER_SESSION_IDLE_TIMEOUT_MS` | `300000` (5 min)                      | Idle time before an unused session is closed.                                                                                      |
| `BROWSER_SESSION_MAX_LIFETIME_MS` | `1800000` (30 min)                    | Hard cap on a session's total lifetime, regardless of activity.                                                                    |
| `AGENT_BROWSER_STATE_PATH`        | server-managed dir                    | Where saved logins/history are stored. This is server-only and never mounted into agent sandboxes.                                 |

For bare-metal (no Docker) deployments, the browser runs in-process; install the browser binary once with `pnpm --filter @repo/backend exec playwright install chromium`, or point `BROWSER_LOCAL_CHANNEL=chrome` at an installed Chrome. See the full [Configuration Reference](/guide/configuration#web-browser) for every option.
