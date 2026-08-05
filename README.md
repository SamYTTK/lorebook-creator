# LOREDECK — Lorebook Creator

A SillyTavern-inspired **Lorebook Creator**: chat with any model through an OpenAI-compatible API while it **drafts, iterates and manages a structured lorebook** for you — either collaboratively or as an autonomous agent — with a **human-in-the-loop review queue** so nothing is committed without your approval.

No Electron. It's a local web app: Node + Express backend, React + Vite frontend.

## Features

- **Any model, any OpenAI-compatible endpoint** — point it at OpenAI, a local server (Ollama, LM Studio, vLLM, KoboldCpp, …) or a hosted provider. Full generation parameter control (temperature, top_p, top_k, penalties, stop, seed, reasoning effort, max tokens).
- **Smooth streaming chat** with SSE token streaming, a **collapsible reasoning block** for reasoning models, markdown rendering and full multimodal input (**images, audio and video** — video is split into frames with bundled ffmpeg).
- **Lorebook engine** — entries stored in the [SillyTavern lorebook JSON format](https://docs.sillytavern.app), import/export compatible. Keys are scanned against recent chat and activated entries are injected into context at a configurable depth/role.
- **Agentic World Architect** — the model gets tool access to create/update/delete/search lorebook entries. Three autonomy modes: *off*, *collaborative* (tools, waits for you) and *autonomous* (builds freely). Fine-grained **tool permissions**.
- **Review queue** — when "require review" is on, every proposed change is staged and only committed to disk after you click **Apply** (with a diff preview). Apply one or all.
- **Prompt builder like SillyTavern** — ordered prompt blocks with `depth`, `position`, `role` and injection semantics. Import SillyTavern prompt presets (modern `{name, messages}` or legacy array format) and export them.
- **Dynamic panel UI** — every panel is a free-floating, drag/resize-able window (react-rnd). Lock the layout, maximize, reset, and the layout persists.
- **Recent changes panel** — chat sessions, applied lorebook edits and recent agent tool calls in one place.
- **Portable data** — lorebooks, chats, settings, media and staged changes all live as plain JSON/files in `data/`. Export chats as **JSON or plain text**.
- **Caching** — model lists, video frames and other computed data are cached with TTLs (clearable from Settings).

## Quick start

```bash
npm install          # installs backend + frontend workspaces
npm run dev          # backend on :3100 (tsx watch) + frontend on :5173 (vite)
```

Open http://localhost:5173, open **Settings**, enter your API base URL + key, and start chatting.

Production mode:

```bash
npm run build        # compiles backend + frontend into frontend/dist
npm start            # backend serves the built app on http://localhost:3100
```

## Configuration

- **Settings panel** → API connection (base URL, key, extra headers, model), generation parameters, main system prompt, lorebook context options.
- **Agent panel** → autonomy mode, review toggle, max tool turns, agent system prompt, allowed tool permissions.
- **Prompt Builder panel** → active preset selection and block editing.

## Using the World Architect

1. Create or import a lorebook (Lorebook panel).
2. In the Agent panel, set autonomy to *Collaborative* or *Autonomous* and enable the tools you trust.
3. Keep **"Require review before committing changes"** on to approve every edit first.
4. In chat, describe your world. The agent will propose entries. Approve/reject them in the **Review** tab.

## SillyTavern compatibility

- **Lorebooks**: exact ST JSON format (`{ name, description, entries: { <uuid>: { ... } } }`) for import and export.
- **Prompt presets**: ST Prompt Manager presets import into the Prompt Builder.
- **Prompt semantics**: depth (distance from the end of the conversation), position (top/bottom of depth group), role (system/user/assistant), injection (own message vs system content).

## Project layout

```
backend/   Express + TypeScript API (LLM proxy, lorebook engine, agent loop, history, media, review)
frontend/  React + Vite + TypeScript UI (chat, floating panels, editors)
data/      runtime data: lorebooks/, chats/, prompts/, review/, media/, cache/ (gitignored)
test/      mock OpenAI server + e2e + video pipeline tests
```

## Tests

```bash
npm run build
node test/e2e.mjs      # full API integration suite against a mock provider
node test/video.mjs    # ffmpeg video frame extraction pipeline
```

## Notes

- Your API key is stored locally in `data/settings.json` (gitignored).
- Video support uses a bundled static ffmpeg binary; no system install needed.
