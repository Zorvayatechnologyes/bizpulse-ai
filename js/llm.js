/* ============================================================
   BizPulse AI — LLM narrative layer (hybrid)
   The numbers are always computed locally. When the user supplies
   an API key, this module asks an LLM to write the narrative;
   otherwise the caller keeps the built-in narrative. Every call is
   wrapped so a failure never breaks the app.
   Exposes: window.BPLLM
   ============================================================ */
(function () {
  const DEFAULTS = {
    openai: { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
    anthropic: { model: 'claude-3-5-haiku-latest', baseUrl: 'https://api.anthropic.com/v1' }
  };

  function cfg(settings) {
    const s = (settings && settings.llm) || {};
    const provider = s.provider || 'openai';
    const def = DEFAULTS[provider] || DEFAULTS.openai;
    return {
      provider,
      apiKey: (s.apiKey || '').trim(),
      model: (s.model || '').trim() || def.model,
      baseUrl: (s.baseUrl || '').trim() || def.baseUrl
    };
  }
  function isConfigured(settings) {
    const c = cfg(settings);
    return !!c.apiKey;
  }

  function composePrompt(agent, m) {
    const facts = Object.keys(agent.facts || {}).map(k => '- ' + k.replace(/_/g, ' ') + ': ' + agent.facts[k]).join('\n');
    const findings = (agent.findings || []).map(f => '- ' + f.title + (f.num ? ' = ' + f.num : '') + (f.detail ? ' — ' + f.detail : '')).join('\n');
    const system =
      'You are the ' + agent.name + ', a ' + agent.role + ' on a business-analysis team advising a business owner. ' +
      'Write a short, plain-English analysis of 3 to 5 sentences. Be specific and use ONLY the figures provided — never invent numbers. ' +
      'No bullet points, no headings, no preamble; write flowing prose a non-finance owner can act on.';
    const user =
      'Business: ' + (m.businessName || 'the business') + ' (currency ' + (m.currency || 'INR') + ', ' + m.n + ' months of data).\n\n' +
      'Computed figures:\n' + (facts || '(none)') + '\n\n' +
      'Findings:\n' + (findings || '(none)') + '\n\n' +
      'Write your ' + agent.focus + ' analysis now.';
    return { system, user };
  }

  async function callLLM(c, system, user, maxTokens) {
    if (c.provider === 'anthropic') {
      const res = await fetch(c.baseUrl.replace(/\/$/, '') + '/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': c.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({ model: c.model, max_tokens: maxTokens || 400, system: system, messages: [{ role: 'user', content: user }] })
      });
      if (!res.ok) throw new Error('Anthropic ' + res.status + ': ' + (await res.text()).slice(0, 180));
      const data = await res.json();
      const block = (data.content || []).find(b => b.type === 'text');
      return block ? block.text.trim() : '';
    }
    // OpenAI-compatible
    const res = await fetch(c.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + c.apiKey },
      body: JSON.stringify({
        model: c.model, max_tokens: maxTokens || 400, temperature: 0.4,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    });
    if (!res.ok) throw new Error('LLM ' + res.status + ': ' + (await res.text()).slice(0, 180));
    const data = await res.json();
    return ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();
  }

  /* narrative for one agent; returns {text, live} or null on failure */
  async function narrate(agent, m, settings) {
    const c = cfg(settings);
    if (!c.apiKey) return null;
    try {
      const p = composePrompt(agent, m);
      const text = await callLLM(c, p.system, p.user, 400);
      if (!text) return null;
      return { text, live: true, model: c.model, provider: c.provider };
    } catch (e) {
      return { error: String(e.message || e), live: false };
    }
  }

  /* answer an open question using a chosen agent's facts */
  async function ask(question, agent, m, settings) {
    const c = cfg(settings);
    const facts = Object.keys(agent.facts || {}).map(k => '- ' + k.replace(/_/g, ' ') + ': ' + agent.facts[k]).join('\n');
    if (!c.apiKey) return null;
    try {
      const system = 'You are the ' + agent.name + ' (' + agent.role + ') advising a business owner. Answer their question in 2 to 4 sentences using ONLY the figures provided. If the figures do not cover the question, say so plainly and suggest what data would help.';
      const user = 'Business: ' + (m.businessName || 'the business') + '. Currency ' + (m.currency || 'INR') + '.\n\nFigures:\n' + facts + '\n\nQuestion: ' + question;
      const text = await callLLM(c, system, user, 350);
      return text ? { text, live: true } : null;
    } catch (e) {
      return { error: String(e.message || e), live: false };
    }
  }

  async function test(settings) {
    const c = cfg(settings);
    if (!c.apiKey) return { ok: false, message: 'No API key set.' };
    try {
      const text = await callLLM(c, 'You are a helpful assistant.', 'Reply with the single word: ready', 10);
      return { ok: true, message: 'Key works — model "' + c.model + '" replied: ' + (text || '(empty)') };
    } catch (e) {
      return { ok: false, message: String(e.message || e) };
    }
  }

  window.BPLLM = { isConfigured, narrate, ask, test, defaults: DEFAULTS };
})();
