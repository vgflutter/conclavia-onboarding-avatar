import { createServer } from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getRiskProfileQuestionnaire, scoreRiskProfileAnswers } = require('../../../aihat-server/src/services/investorRiskProfile.service.js');
const questionnaire = getRiskProfileQuestionnaire();
const answers = Object.fromEntries(questionnaire.sections.flatMap(s => s.questions.map(q => [q.id, q.type === 'multi_select' ? [(q.answers[0].answerId || q.answers[0].id)] : (q.answers[0].answerId || q.answers[0].id)])));
const scored = scoreRiskProfileAnswers(answers);
const writes = [];
createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let body = {};
  if (url.pathname === '/health') body = { ok: true };
  else if (url.pathname === '/writes') body = writes;
  else if (req.method !== 'GET') { writes.push({ path: url.pathname, method: req.method }); res.statusCode = 405; }
  else if (url.pathname.endsWith('/risk-profile/questionnaire')) body = questionnaire;
  else if (url.pathname.endsWith('/risk-profile')) body = { answers, scores: scored.scores, result: scored.deterministicResult };
  else if (url.pathname.endsWith('/portfolio')) body = { portfolios: [], portfolioCount: 0, portfolioLimit: 2 };
  else if (url.pathname.endsWith('/users/me')) body = { user: { email: 'synthetic@example.test', name: 'Cliente di prova', profile: 'premium', uiLocale: 'it' } };
  else { res.statusCode = 404; body = { error: 'Synthetic endpoint not implemented' }; }
  res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(body));
}).listen(3115, 'localhost');
