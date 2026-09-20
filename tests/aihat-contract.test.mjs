import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { riskFlow, portfolioFlow, portfolioDraft, validateHostAnswers } from '../../aihat-client/lib/onboarding/questionnaires';
import { validateFlow, validateAnswer, activeQuestions } from '../src/lib/onboarding/validation';
import { completionErrors } from '../src/lib/onboarding/engine';

const require = createRequire(import.meta.url);
const backend = require('../../aihat-server/src/services/investorRiskProfile.service.js');
const questionnaire = backend.getRiskProfileQuestionnaire();
test('the actual AIHat risk questionnaire passes unchanged IDs through the generic service and backend scoring', () => {
  const hostFlow = riskFlow(questionnaire);
  const flow = validateFlow(hostFlow);
  const answers = {};
  for (const question of flow.questions) answers[question.id] = validateAnswer(question,
    question.type === 'multi_select' ? [question.options[0].id] : question.options[0].id);
  assert.equal(flow.questions.length, questionnaire.sections.flatMap((s) => s.questions).length);
  assert.deepEqual(completionErrors(flow, answers), []);
  const validated = validateHostAnswers(hostFlow, answers);
  assert.ok(backend.scoreRiskProfileAnswers(validated).deterministicResult.profile.code);
  assert.equal(JSON.stringify(flow).includes('knowledgeScore'), false);
  assert.equal(JSON.stringify(flow).includes('complexityRank'), false);
});
function portfolioAnswers(patch = {}) {
  return { portfolioType: 'new', objective: 'moderate_growth', incomeNeed: 'none', horizonBucket: '3_7y',
    hasWithdrawal: 'no', amount: 10000, baseCurrency: 'CHF', riskUsage: 'auto', currencyHedge: 'dont_know',
    geos: ['global'], instruments: 'etf_only', allocationMode: 'auto', ...patch };
}
test('AIHat portfolio contract is accepted by the independent schema with complete manual allocation', () => {
  const flow = validateFlow(portfolioFlow());
  const answers = portfolioAnswers({ allocationMode: 'manual', equities: 50, bonds: 30, commodities: 10, cash: 10, hasWithdrawal: 'yes', withdrawalAmount: 1000, withdrawalMonth: '2027-06', withdrawalProbability: 'possible' });
  for (const q of activeQuestions(flow, answers)) if (Object.hasOwn(answers, q.id)) validateAnswer(q, answers[q.id]);
  assert.deepEqual(completionErrors(flow, answers), []);
  const draft = portfolioDraft(answers);
  assert.deepEqual(draft.portfolio?.allocation, { equities: 50, bonds: 30, commodities: 10, cash: 10 });
  assert.equal(draft.portfolio?.plannedWithdrawals?.[0].date, '2027-06');
  assert.equal(draft.portfolio?.amount, 10000);
});
test('all-equity requests retain the existing AIHat acknowledgement step', () => {
  const a = portfolioAnswers({ riskUsage: 'all_equity' }); delete a.allocationMode;
  const draft = portfolioDraft(a);
  assert.equal(draft.allEquityRequested, true);
  assert.equal(draft.portfolio?.riskUsage, undefined);
  assert.equal(draft.portfolio?.allocation, undefined);
});
test('import is a separate branch, no investment answers are manufactured', () => {
  const flow = validateFlow(portfolioFlow());
  const answers = { portfolioType: 'import' };
  assert.equal(activeQuestions(flow, answers).length, 1);
  assert.deepEqual(portfolioDraft(answers), { portfolioType: 'import' });
});
test('host revalidates incompatible or unexpected result data', () => {
  assert.throws(() => portfolioDraft(portfolioAnswers({ amount: 499 })));
  assert.throws(() => portfolioDraft(portfolioAnswers({ hacked: 'yes' })));
  assert.throws(() => portfolioDraft(portfolioAnswers({ preferenceTags: ['unrecognized'] })));
  assert.throws(() => portfolioDraft(portfolioAnswers({ hasWithdrawal: 'yes' })));
  assert.throws(() => portfolioDraft(portfolioAnswers({ allocationMode: 'manual', equities: 60, bonds: 50, commodities: 0, cash: 0 })));
});
