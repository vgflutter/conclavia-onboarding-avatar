import { createServer } from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getRiskProfileQuestionnaire, scoreRiskProfileAnswers } = require('../../../aihat-server/src/services/investorRiskProfile.service.js');
const questionnaire = getRiskProfileQuestionnaire();
const defaults = Object.fromEntries(questionnaire.sections.flatMap(s => s.questions.map(q => [q.id, q.type === 'multi_select' ? [(q.answers[0].answerId || q.answers[0].id)] : (q.answers[0].answerId || q.answers[0].id)])));
const writes = [];
const users = new Map();
function state(email) {
  if (!users.has(email)) users.set(email, { hasProfile: true, locale: 'it', answers: defaults, failProfileOnce: false });
  return users.get(email);
}
function identity(req) {
  try { return JSON.parse(Buffer.from((req.headers.authorization || '').split('.')[1], 'base64url')).email || 'synthetic@example.test'; }
  catch { return 'synthetic@example.test'; }
}
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const email = identity(req);
  let body = {}, input = {};
  if (req.method === 'POST') {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    try { input = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { res.statusCode = 400; }
  }
  const account = state(email);
  if (url.pathname === '/health') body = { ok: true };
  else if (url.pathname === '/writes') body = writes.filter(w => !url.searchParams.has('email') || w.email === url.searchParams.get('email'));
  else if (url.pathname === '/__test/config' && req.method === 'POST') {
    if (!String(input.email).endsWith('@example.test')) { res.statusCode = 400; body = { error: 'Synthetic identity required' }; }
    else { Object.assign(state(input.email), input); body = { ok: true }; }
  }
  else if (req.method === 'POST' && url.pathname.endsWith('/risk-profile')) {
    writes.push({ path: url.pathname, method: req.method, email, body: input });
    if (account.failProfileOnce) { account.failProfileOnce = false; res.statusCode = 503; body = { error: 'Synthetic transient failure' }; }
    else {
      try {
        const scored = scoreRiskProfileAnswers(input.answers);
        account.answers = input.answers; account.hasProfile = true;
        body = { status: 'completed', answers: input.answers, scores: scored.scores, result: scored.deterministicResult };
      } catch { res.statusCode = 400; body = { error: 'Invalid synthetic answers' }; }
    }
  }
  else if (req.method === 'POST' && url.pathname.endsWith('/portfolio/import/analyze')) {
    writes.push({ path: url.pathname, method: req.method, email, body: input });
    const totalAmount = input.holdings.reduce((sum, holding) => sum + holding.amount, 0);
    body = { importedPortfolio: { totalAmount, holdings: input.holdings.map(holding => ({ ...holding, name: 'Synthetic imported ETF', symbol: 'SYNTH.TEST', weight: holding.amount / totalAmount * 100, wholeShareEligible: true, verification: { providerStatus: 'verified', inUniverse: true, providerSymbolResolved: true, historicalAvailable: true, fxResolved: true } })) }, excludedHoldings: [], diagnostics: { headline: 'Anteprima sintetica pronta', summary: 'Controlla le posizioni prima della conferma.', strengths: [], weaknesses: [], metrics: { mappedHoldings: input.holdings.length, unmappedHoldings: 0, assetAllocation: { equities: 100, bonds: 0, commodities: 0, cash: 0 } } } };
  }
  else if (req.method !== 'GET') { writes.push({ path: url.pathname, method: req.method, email, body: input }); res.statusCode = 405; }
  else if (url.pathname.endsWith('/risk-profile/questionnaire')) body = questionnaire;
  else if (url.pathname.endsWith('/risk-profile')) {
    if (account.hasProfile) { const scored = scoreRiskProfileAnswers(account.answers); body = { answers: account.answers, scores: scored.scores, result: scored.deterministicResult }; }
    else body = { answers: null, result: null };
  }
  else if (url.pathname.endsWith('/portfolio')) body = { portfolios: [], portfolioCount: 0, portfolioLimit: 2 };
  else if (url.pathname.endsWith('/users/me')) body = { user: { email, name: 'Cliente di prova', profile: 'premium', uiLocale: account.locale } };
  else { res.statusCode = 404; body = { error: 'Synthetic endpoint not implemented' }; }
  res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(body));
}).listen(3115, 'localhost');
