---
name: local-research
description: "Iterative deep research using SearXNG (no API keys). Use when Operator asks to research, investigate, or find information about any topic. Performs multi-stage search: overview → news → expert sources → deep-dive. Results saved to /home/node/.openclaw/workspace/research/"
---

# Local Research Pipeline

Self-contained deep research using SearXNG. No API keys required.

## When to Use
- "research X"
- "find information about X"
- "investigate X"
- "что такое X" / "расскажи про X"

## How It Works

1. Overview: broad search for fundamentals
2. News: recent developments
3. Expert sources: MIT, Forbes, research papers
4. Deep-dive: follow interesting URLs with web_fetch

## Usage

```bash
# Direct
/home/node/.openclaw/workspace/scripts/research.sh "topic"

/home/node/.openclaw/workspace/scripts/research.sh "AI agents 2026" ~/myresearch/
```

## Script Location
`/home/node/.openclaw/workspace/scripts/research.sh`

## Output
Markdown report in `~/workspace/research/YYYYMMDD_topic/`
