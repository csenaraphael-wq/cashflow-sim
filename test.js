const { simulateCashFlow } = require('./simulate');

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
