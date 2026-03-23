# 🐌 Stoic Snail

Personal AI gateway. Multi-channel messaging, voice, tools, automation.

## What it does

Stoic Snail runs a local gateway that connects your AI assistant to the messaging channels you already use: WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Matrix, Microsoft Teams, and others. It handles sessions, tools, voice, cron jobs, and a web control UI — all from a single process on your machine or server.

## Requirements

- Node 24 (recommended) or Node 22.16+
- Docker (for containerized deployment)

## Install (Docker)

```bash
git clone https://github.com/MonadGhost/ArhiNova.git
cd ArhiNova
cp .env.example .env
# Edit .env with your API keys and paths
docker build -t openclaw:local .
docker compose up -d
```

## Install (from source)

```bash
git clone https://github.com/MonadGhost/ArhiNova.git
cd ArhiNova
pnpm install
pnpm build
pnpm ui:build
node openclaw.mjs onboard --install-daemon
```

## Update

```bash
cd ArhiNova
git pull origin main
docker build -t openclaw:local .
docker compose down && docker compose up -d
```

For source installs:

```bash
git pull origin main
pnpm install
pnpm build
```

## Configuration

Edit `~/.openclaw/openclaw.json`:

```json5
{
  agent: {
    model: "anthropic/claude-opus-4-6",
  },
}
```

Channel tokens (Telegram, Discord, Slack, etc.) go into the same config or corresponding environment variables. See `docs/` for per-channel setup.

## Project structure

```
src/           — core gateway, CLI, agent runtime
extensions/    — channel plugins (openrouter, searxng, etc.)
skills/        — workspace skills (weather, trello, voice-call, etc.)
docker/        — Docker support files
docs/          — documentation
ui/            — web control UI
apps/          — companion apps (macOS, iOS, Android)
```

## License

MIT
