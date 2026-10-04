# BizPulse AI — multi-agent business analyst

A self-contained business-analysis website. It computes profit rate, margins,
burn rate, runway, cash flow, break-even and more from your own numbers, then a
team of seven specialist AI agents interprets the results and the CFO
orchestrator produces one prioritised action plan and a health score.

## Using it

1. Open `index.html` (or the deployed URL) in any modern browser.
2. Go to **Data** and either enter months by hand or upload a CSV/Excel file.
3. Open **Dashboard** for KPIs and charts, and **Agents** to read each agent's
   findings. **Report** gives a printable summary, and **Knowledge** is a
   searchable glossary of the business and finance terms and formulas.

Everything runs in the browser. Your data is stored in this browser's local
storage and never leaves the device unless you enable live AI.

## Live AI

The numbers are always computed locally, and the agents' written commentary is
always generated live by a free, keyless AI service — no API key is required.
If you prefer, open **Settings → Live AI narratives** and switch to your own
OpenAI-compatible or Anthropic key instead. If a live call ever fails, the app
shows a retry notice rather than silently switching to the built-in writer.

## Files

- `index.html` — the page
- `styles.css` — styling
- `js/data.js` — data model, formatting, storage
- `js/engine.js` — the deterministic metrics engine
- `js/agents.js` — the seven agents and the orchestrator
- `js/llm.js` — live-AI narrative layer (free, keyless provider by default)
- `js/charts.js` — Chart.js wrappers
- `js/app.js` — UI controller

Chart.js and SheetJS are loaded from a CDN.

## Design

The interface uses a soft pastel palette on a fixed background gradient that runs
from muted teal `#BCC7C7` at the top to soft pink `#F7CBCA` at the bottom, with
floating pastel panels over it. Supporting colours: pale cyan-white `#F1F7F7`
for fields and inner surfaces, `#D5E5E5` for soft fills, pastel aqua `#BDD7D8`
as the accent, soft pink `#F7CBCA` for attention states, `#DDD3D3` for neutral
borders, and dark slate `#5D6B6B` for the sidebar and primary text. Layout is a
fixed sidebar on desktop that becomes a slide-in drawer on mobile.

Figures are estimates derived from the data you enter and are not financial advice.
