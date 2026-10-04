# BizPulse AI — multi-agent business analyst

A self-contained business-analysis website. It computes profit rate, margins,
burn rate, runway, cash flow, break-even and more from your own numbers, then a
team of seven specialist AI agents interprets the results and the CFO
orchestrator produces one prioritised action plan and a health score.

## Using it

1. Open `index.html` (or the deployed URL) in any modern browser.
2. Go to **Data** and either enter months by hand, upload a CSV/Excel file, or
   load a sample business from the **Demo data** tab.
3. Open **Dashboard** for KPIs and charts, and **Agents** to read each agent's
   findings. **Report** gives a printable summary.

Everything runs in the browser. Your data is stored in this browser's local
storage and never leaves the device unless you enable live AI.

## Live AI (optional)

The numbers are always computed locally. To have an LLM write the agents'
commentary instead of the built-in writer, open **Settings → Live AI
narratives** and paste an API key (OpenAI-compatible or Anthropic). The key is
stored only in this browser and is sent directly to the provider. With no key,
the app still works using the built-in narrative writer.

## Files

- `index.html` — the page
- `styles.css` — styling
- `js/data.js` — data model, sample businesses, formatting, storage
- `js/engine.js` — the deterministic metrics engine
- `js/agents.js` — the seven agents and the orchestrator
- `js/llm.js` — optional live-AI narrative layer
- `js/charts.js` — Chart.js wrappers
- `js/app.js` — UI controller

Chart.js and SheetJS are loaded from a CDN.

Figures are estimates derived from the data you enter and are not financial advice.
