/**
 * Cash Flow Risk Simulator — core Monte Carlo engine
 * Pure logic, no framework, no DB. Test with node directly.
 */

// Maps variability levels to standard deviation as a % of the average value.
const VARIABILITY_TO_STD_DEV_PCT = {
  steady: 0.05,
  somewhat_variable: 0.15,
  very_variable: 0.30,
};

/**
 * Generates a normally-distributed random number using the Box-Muller transform.
 * mean: center value, stdDev: standard deviation
 */
function randomNormal(mean, stdDev) {
  let u1 = 0, u2 = 0;
  // avoid 0 (log(0) is undefined)
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * We use a normal distribution (not lognormal) here because monthly income/expense
 * swings for a small business are reasonably symmetric around the average — a bad
 * month and a good month are roughly equally likely in size. Lognormal would be a
 * better fit if we were modeling something that can't go negative and has a long
 * right tail (e.g. one huge invoice), but for this MVP normal keeps the math simple
 * and the results intuitive. We clamp income/expenses at 0 so nothing goes negative.
 */

function percentile(sortedArr, p) {
  const idx = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedArr[lower];
  const weight = idx - lower;
  return sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight;
}

/**
 * Runs the Monte Carlo cash flow simulation.
 *
 * @param {Object} params
 * @param {number} params.startingCashBalance
 * @param {number} params.avgMonthlyIncome
 * @param {"steady"|"somewhat_variable"|"very_variable"} params.incomeVariability
 * @param {number} params.avgMonthlyExpenses
 * @param {"steady"|"somewhat_variable"|"very_variable"} params.expenseVariability
 * @param {Array<{month: number, amount: number}>} [params.knownUpcomingExpenses]
 * @param {number} [params.monthsToSimulate=12]
 * @param {number} [params.numberOfSimulations=5000]
 */
function simulateCashFlow(params) {
  const {
    startingCashBalance,
    avgMonthlyIncome,
    incomeVariability,
    avgMonthlyExpenses,
    expenseVariability,
    knownUpcomingExpenses = [],
    monthsToSimulate = 12,
    numberOfSimulations = 5000,
  } = params;

  const incomeStdDev = avgMonthlyIncome * VARIABILITY_TO_STD_DEV_PCT[incomeVariability];
  const expenseStdDev = avgMonthlyExpenses * VARIABILITY_TO_STD_DEV_PCT[expenseVariability];

  // Build a quick lookup for known upcoming expenses by month
  const upcomingExpensesByMonth = {};
  for (const item of knownUpcomingExpenses) {
    upcomingExpensesByMonth[item.month] = (upcomingExpensesByMonth[item.month] || 0) + item.amount;
  }

  // balancesByMonth[monthIndex] = array of ending balances across all simulations for that month
  const balancesByMonth = Array.from({ length: monthsToSimulate }, () => []);

  let simulationsThatWentNegative = 0;

  for (let sim = 0; sim < numberOfSimulations; sim++) {
    let balance = startingCashBalance;
    let wentNegativeThisRun = false;

    for (let month = 1; month <= monthsToSimulate; month++) {
      const income = Math.max(0, randomNormal(avgMonthlyIncome, incomeStdDev));
      const expenses = Math.max(0, randomNormal(avgMonthlyExpenses, expenseStdDev));
      const extraExpense = upcomingExpensesByMonth[month] || 0;

      balance = balance + income - expenses - extraExpense;
      balancesByMonth[month - 1].push(balance);

      if (balance < 0) wentNegativeThisRun = true;
    }

    if (wentNegativeThisRun) simulationsThatWentNegative++;
  }

  const monthlyPercentiles = balancesByMonth.map((balances, i) => {
    const sorted = [...balances].sort((a, b) => a - b);
    return {
      month: i + 1,
      p10: percentile(sorted, 10),
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
    };
  });

  // Worst case month = the month where the median (p50) balance is lowest
  const worstCaseMonth = monthlyPercentiles.reduce((worst, curr) =>
    curr.p50 < worst.p50 ? curr : worst
  ).month;

  const probabilityOfNegativeBalance = (simulationsThatWentNegative / numberOfSimulations) * 100;

  return {
    probabilityOfNegativeBalance: Math.round(probabilityOfNegativeBalance * 10) / 10,
    monthlyPercentiles: monthlyPercentiles.map(m => ({
      month: m.month,
      p10: Math.round(m.p10),
      p50: Math.round(m.p50),
      p90: Math.round(m.p90),
    })),
    worstCaseMonth,
  };
}

// Ordered from least to most variable — used to bump variability up/down one level.
const VARIABILITY_LEVELS = ['steady', 'somewhat_variable', 'very_variable'];

// Friendly labels for the ranked sensitivity output.
const INPUT_LABELS = {
  avgMonthlyIncome: 'Average monthly income',
  avgMonthlyExpenses: 'Average monthly expenses',
  incomeVariability: 'Income variability',
  expenseVariability: 'Expense variability',
};

/**
 * Builds the set of perturbed variants for a single input.
 *
 * Numeric inputs (income/expenses) are moved ±20%. Variability inputs are
 * bumped up/down one level; at an extreme (e.g. already "steady") only the
 * one available direction is used. Returns an array of full param objects,
 * each a copy of `base` with exactly one field changed.
 */
function buildVariants(base, input) {
  const variants = [];

  if (input === 'incomeVariability' || input === 'expenseVariability') {
    const idx = VARIABILITY_LEVELS.indexOf(base[input]);
    for (const nextIdx of [idx + 1, idx - 1]) {
      if (nextIdx >= 0 && nextIdx < VARIABILITY_LEVELS.length) {
        variants.push({ ...base, [input]: VARIABILITY_LEVELS[nextIdx] });
      }
    }
  } else {
    // Numeric input: +20% and -20%.
    variants.push({ ...base, [input]: base[input] * 1.2 });
    variants.push({ ...base, [input]: base[input] * 0.8 });
  }

  return variants;
}

/**
 * Runs a basic one-at-a-time sensitivity analysis on top of the Monte Carlo
 * engine. Takes the same inputs as simulateCashFlow, establishes a baseline
 * probabilityOfNegativeBalance, then perturbs each key input (holding all
 * others constant) and measures how much that probability swings.
 *
 * The impact score for an input is the average absolute change (in percentage
 * points) in probabilityOfNegativeBalance across its perturbations. A bigger
 * swing means that input matters more to overall risk.
 *
 * Note: because the underlying simulation is stochastic, small impact scores
 * (roughly < 1 point) can be dominated by Monte Carlo noise. We use the same
 * simulation count as a normal run, which keeps typical noise well below the
 * impacts that matter for ranking.
 *
 * @param {Object} params  Same shape as simulateCashFlow's params.
 * @returns {Array<{input: string, label: string, impactScore: number}>}
 *          Ranked highest-impact first.
 */
function analyzeSensitivity(params) {
  const {
    startingCashBalance,
    avgMonthlyIncome,
    incomeVariability,
    avgMonthlyExpenses,
    expenseVariability,
    knownUpcomingExpenses = [],
    monthsToSimulate = 12,
    numberOfSimulations = 5000,
  } = params;

  // The frozen set of original inputs every variant is derived from.
  const base = {
    startingCashBalance,
    avgMonthlyIncome,
    incomeVariability,
    avgMonthlyExpenses,
    expenseVariability,
    knownUpcomingExpenses,
    monthsToSimulate,
    numberOfSimulations,
  };

  const baseline = simulateCashFlow(base).probabilityOfNegativeBalance;

  const INPUTS = [
    'avgMonthlyIncome',
    'avgMonthlyExpenses',
    'incomeVariability',
    'expenseVariability',
  ];

  const ranked = INPUTS.map((input) => {
    const variants = buildVariants(base, input);

    // Average absolute swing from baseline across this input's variants.
    const totalSwing = variants.reduce((sum, variant) => {
      const prob = simulateCashFlow(variant).probabilityOfNegativeBalance;
      return sum + Math.abs(prob - baseline);
    }, 0);
    const impactScore = variants.length > 0 ? totalSwing / variants.length : 0;

    return {
      input,
      label: INPUT_LABELS[input],
      impactScore: Math.round(impactScore * 10) / 10,
    };
  });

  ranked.sort((a, b) => b.impactScore - a.impactScore);

  return { baseline, ranked };
}

module.exports = { simulateCashFlow, analyzeSensitivity };
