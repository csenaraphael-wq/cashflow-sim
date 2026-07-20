const { simulateCashFlow, analyzeSensitivity } = require('./simulate');

function printResult(label, result) {
  console.log(`\n=== ${label} ===`);
  console.log(`Probability of running negative at some point: ${result.probabilityOfNegativeBalance}%`);
  console.log(`Worst case (median) month: Month ${result.worstCaseMonth}`);
  console.log('Month | P10 (bad case) | P50 (median) | P90 (good case)');
  for (const m of result.monthlyPercentiles) {
    console.log(`  ${m.month.toString().padEnd(4)} | $${m.p10.toLocaleString().padEnd(14)} | $${m.p50.toLocaleString().padEnd(12)} | $${m.p90.toLocaleString()}`);
  }
}

// Case 1: Freelancer with variable income, thin cash buffer, high risk profile
const freelancer = simulateCashFlow({
  startingCashBalance: 4000,
  avgMonthlyIncome: 5000,
  incomeVariability: 'very_variable',
  avgMonthlyExpenses: 4500,
  expenseVariability: 'somewhat_variable',
  knownUpcomingExpenses: [{ month: 6, amount: 3000 }], // e.g. annual software renewal / taxes
  monthsToSimulate: 12,
  numberOfSimulations: 5000,
});
printResult('Freelancer ($5k/mo income, thin margin, volatile)', freelancer);

// Case 2: Small shop with steadier income, healthier buffer
const smallShop = simulateCashFlow({
  startingCashBalance: 40000,
  avgMonthlyIncome: 50000,
  incomeVariability: 'somewhat_variable',
  avgMonthlyExpenses: 42000,
  expenseVariability: 'steady',
  knownUpcomingExpenses: [{ month: 4, amount: 10000 }], // e.g. new equipment purchase
  monthsToSimulate: 12,
  numberOfSimulations: 5000,
});
printResult('Small shop ($50k/mo income, healthier buffer)', smallShop);

// Case 3: Tight margin business — should show high risk
const tightMargin = simulateCashFlow({
  startingCashBalance: 2000,
  avgMonthlyIncome: 8000,
  incomeVariability: 'very_variable',
  avgMonthlyExpenses: 7800,
  expenseVariability: 'somewhat_variable',
  monthsToSimulate: 12,
  numberOfSimulations: 5000,
});
printResult('Tight margin business (small buffer, thin profit)', tightMargin);

// ---------------------------------------------------------------------------
// Sensitivity analysis
// ---------------------------------------------------------------------------

let sensitivityFailures = 0;
function check(condition, message) {
  if (!condition) {
    sensitivityFailures++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('\n=== Sensitivity analysis (tight margin business) ===');

// Reuse the tight-margin scenario — expenses/income should dominate the risk.
const sensitivityParams = {
  startingCashBalance: 2000,
  avgMonthlyIncome: 8000,
  incomeVariability: 'very_variable',
  avgMonthlyExpenses: 7800,
  expenseVariability: 'somewhat_variable',
  monthsToSimulate: 12,
  numberOfSimulations: 5000,
};
const sensitivity = analyzeSensitivity(sensitivityParams);

console.log(`Baseline chance of running negative: ${sensitivity.baseline}%`);
console.log('Input                | Impact (pts)');
for (const item of sensitivity.ranked) {
  console.log(`  ${item.input.padEnd(20)} | ${item.impactScore}`);
}

// Shape: all four key inputs are ranked.
check(Array.isArray(sensitivity.ranked), 'ranked should be an array');
check(sensitivity.ranked.length === 4, 'should rank exactly 4 inputs');

// Every entry is well-formed.
for (const item of sensitivity.ranked) {
  check(typeof item.input === 'string' && item.input.length > 0, 'each entry has an input name');
  check(typeof item.label === 'string' && item.label.length > 0, `each entry has a label (${item.input})`);
  check(typeof item.impactScore === 'number' && item.impactScore >= 0, `impactScore is a non-negative number (${item.input})`);
}

// Sorted from highest impact to lowest.
for (let i = 1; i < sensitivity.ranked.length; i++) {
  check(
    sensitivity.ranked[i - 1].impactScore >= sensitivity.ranked[i].impactScore,
    'ranked list must be sorted from highest impact to lowest'
  );
}

// Edge case: an input already at a variability extreme (steady can't go lower,
// very_variable can't go higher) must still produce a score without throwing.
const edge = analyzeSensitivity({
  ...sensitivityParams,
  incomeVariability: 'steady',
  expenseVariability: 'very_variable',
});
check(edge.ranked.length === 4, 'edge case still ranks 4 inputs');

// The caller's params object must not be mutated by the analysis.
check(sensitivityParams.avgMonthlyIncome === 8000, 'input params are not mutated (income)');
check(sensitivityParams.incomeVariability === 'very_variable', 'input params are not mutated (variability)');

if (sensitivityFailures === 0) {
  console.log('  ✓ All sensitivity checks passed');
} else {
  console.error(`\n${sensitivityFailures} sensitivity check(s) failed`);
  process.exit(1);
}
