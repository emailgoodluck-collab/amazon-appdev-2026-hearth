# Hearth — A calmer kind of together

Hearth is a hackathon prototype for the Alexa+ simulated experience path. It
helps a caregiving household coordinate an evening when everyday plans change:
a late school pickup, dinner, a family visit, or a caregiver's need for a quiet
moment. A real local MCP server exposes the demo's plan tools over Streamable
HTTP; the web client uses that same MCP endpoint.

The experience adapts a shared timeline, suggests one next step, and keeps a
personal reminder out of the share preview. A readable change trail shows what
the local demo adjusted, and the five most recent plan changes can be undone.
The user reviews that preview before copying it. Nothing is sent to household
members or external services.

## Run locally

Requires Node.js 20+.

```sh
npm ci
npm test
npm start
```

Then open <http://127.0.0.1:5173>. The MCP endpoint is
<http://127.0.0.1:5173/mcp>; the liveness check is
<http://127.0.0.1:5173/health/live>.

The server binds to loopback by default. Set `HOST` and an exact comma-separated
`HEARTH_ALLOWED_ORIGINS` only when you intentionally change the local origin.
The server validates each MCP `Origin` and `Host` to reduce DNS-rebinding risk.

## Demo flow

1. Choose **The bus is running late** to call the MCP tool and shift pickup and
   dinner together.
2. Choose **Nana is coming at six** to ready the entry plan.
3. Choose **I need ten quiet minutes** to see how a personal need changes the
   order without being included in the shared update.
4. Open **Review update** to call the share-preview MCP tool and confirm
   personal details are excluded before copying. Copying is local only; the
   prototype does not send messages.
5. Use **Undo last change** to see the previous plan restored, then choose
   **Reset demo** to return to the initial state.

Every adjustment is shown in **What changed**, including timeline and simulated
device-state changes. Undo can be used repeatedly for up to five recent
adjustments; it never controls a real device or calendar.

## MCP tools

- `get_evening_plan` — returns the current simulated shared timeline and demo
  device state; it intentionally omits the private reminder.
- `adjust_evening_plan` — interprets the demo's bounded pickup, arrival, and
  quiet-time scenarios and changes only local in-memory demo state.
- `undo_last_change` — reverses one of the five most recent plan adjustments;
  the UI shows a readable change trail without exposing the private reminder.
- `preview_household_update` — prepares a reviewable text preview without
  sending it.
- `reset_demo_plan` — resets fictional in-memory demo state for repeatable
  walkthroughs.

The endpoint uses the MCP TypeScript SDK's Streamable HTTP transport, negotiates
protocol version `2025-11-25`, and is stateless at the transport/session layer.
The demo plan lives in the server process's memory and resets when the server
restarts.

## Prototype boundaries

- This is a simulated Alexa+ web experience and a self-hosted MCP server; it is
  not connected to Alexa+ or Amazon devices.
- No microphone is accessed; the voice control replays a sample request.
- Calendar entries, household members, timers, and smart-home states are
  fictional demo data. No real devices, calendars, or accounts are connected.
- The browser sends requests only to the loopback MCP server. The server does
  not call external APIs, log request contents, persist user data, or send
  household messages.
- The share flow creates a local text preview and offers an explicit copy
  action. Private reminder data is excluded server-side.
- The scenario engine is deterministic and local, with no generative AI or AWS
  integration.

## Hackathon submission notes

Primary track: Alexa+ simulated experience. The submission should link this
source repository and include a public English demo video under three minutes.
The repository includes the full source, run instructions, and an MIT license.

Suggested video outline (about 2 minutes):

- 0:00–0:20 — State the caregiving coordination problem and show the evening
  plan.
- 0:20–1:10 — Trigger the late-pickup and quiet-time scenarios; show the plan
  update and private reminder.
- 1:10–1:40 — Open the household share preview and show that the private
  reminder is excluded.
- 1:40–2:00 — Show the local MCP connection and clarify that household devices
  and data are simulated.

The video must be uploaded publicly to YouTube or Vimeo, be in English, and
stay under three minutes. Do not use unlicensed music or third-party footage.
The submission also requires honest product feedback about the Amazon
developer tools used, including what worked, friction encountered, onboarding,
and whether you would use them again. Record actual experience; do not invent
feedback.

This project does not claim the AWS Builder mini-challenge because it does not
use AWS services. The separate Open Source mini-challenge requires an
additional open-source project or contribution alongside the primary-track
submission; this Hearth repository alone should not be presented as satisfying
that separate requirement.
