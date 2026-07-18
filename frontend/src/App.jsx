import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// In production this comes from the VITE_API_URL env var (set in Vercel).
// Locally it falls back to the dev API on port 3001.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_URL = `${API_BASE}/api/simulate`;

const VARIABILITY_OPTIONS = [
  { value: 'steady', label: 'Steady' },
  { value: 'somewhat_variable', label: 'Somewhat variable' },
  { value: 'very_variable', label: 'Very variable' },
];

const INITIAL_FORM = {
  startingCashBalance: 10000,
  avgMonthlyIncome: 8000,
  incomeVariability: 'somewhat_variable',
  avgMonthlyExpenses: 7000,
  expenseVariability: 'somewhat_variable',
};

function currency(n) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export default function App() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [upcomingExpenses, setUpcomingExpenses] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function addExpense() {
    setUpcomingExpenses((prev) => [...prev, { month: '', amount: '' }]);
  }

  function updateExpense(index, field, value) {
    setUpcomingExpenses((prev) =>
      prev.map((exp, i) => (i === index ? { ...exp, [field]: value } : exp))
    );
  }

  function removeExpense(index) {
    setUpcomingExpenses((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    // Only send fully-filled expense rows, coerced to numbers.
    const knownUpcomingExpenses = upcomingExpenses
      .filter((exp) => exp.month !== '' && exp.amount !== '')
      .map((exp) => ({ month: Number(exp.month), amount: Number(exp.amount) }));

    const payload = {
      startingCashBalance: Number(form.startingCashBalance),
      avgMonthlyIncome: Number(form.avgMonthlyIncome),
      incomeVariability: form.incomeVariability,
      avgMonthlyExpenses: Number(form.avgMonthlyExpenses),
      expenseVariability: form.expenseVariability,
      knownUpcomingExpenses,
    };

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.details ? `: ${data.details.join(', ')}` : '';
        throw new Error((data.error || 'Request failed') + detail);
      }
      setResult(data);
    } catch (err) {
      // A network-level failure (API not running) shows up as a TypeError here.
      setError(
        err.message === 'Failed to fetch'
          ? 'Could not reach the API. Is the server running on http://localhost:3001?'
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Cash Flow Risk Simulator</h1>
        <p className="subtitle">
          Estimate the chance of running out of cash over the coming months.
        </p>
      </header>

      <div className="layout">
        <form className="card form" onSubmit={handleSubmit}>
          <label>
            Starting cash balance
            <input
              type="number"
              value={form.startingCashBalance}
              onChange={(e) => updateField('startingCashBalance', e.target.value)}
              required
            />
          </label>

          <label>
            Average monthly income
            <input
              type="number"
              min="0"
              value={form.avgMonthlyIncome}
              onChange={(e) => updateField('avgMonthlyIncome', e.target.value)}
              required
            />
          </label>

          <label>
            Income variability
            <select
              value={form.incomeVariability}
              onChange={(e) => updateField('incomeVariability', e.target.value)}
            >
              {VARIABILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Average monthly expenses
            <input
              type="number"
              min="0"
              value={form.avgMonthlyExpenses}
              onChange={(e) => updateField('avgMonthlyExpenses', e.target.value)}
              required
            />
          </label>

          <label>
            Expense variability
            <select
              value={form.expenseVariability}
              onChange={(e) => updateField('expenseVariability', e.target.value)}
            >
              {VARIABILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="expenses">
            <legend>Known upcoming expenses (optional)</legend>
            {upcomingExpenses.length === 0 && (
              <p className="hint">None added.</p>
            )}
            {upcomingExpenses.map((exp, i) => (
              <div className="expense-row" key={i}>
                <input
                  type="number"
                  min="1"
                  placeholder="Month #"
                  value={exp.month}
                  onChange={(e) => updateExpense(i, 'month', e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Amount"
                  value={exp.amount}
                  onChange={(e) => updateExpense(i, 'amount', e.target.value)}
                />
                <button
                  type="button"
                  className="remove"
                  onClick={() => removeExpense(i)}
                  aria-label="Remove expense"
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="secondary" onClick={addExpense}>
              + Add upcoming expense
            </button>
          </fieldset>

          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Simulating…' : 'Run simulation'}
          </button>
        </form>

        <div className="results">
          {error && <div className="card error">{error}</div>}

          {result && (
            <>
              <div className="card headline">
                <div className="big-number">
                  {result.probabilityOfNegativeBalance}%
                </div>
                <div className="big-label">chance of running out of cash</div>
                <p className="worst-case">
                  Tightest month on average: month {result.worstCaseMonth}
                </p>
                {result.tierLimited && (
                  <p className="hint">
                    Free tier: forecast is limited to 3 months.
                  </p>
                )}
              </div>

              <div className="card chart-card">
                <h2>Projected cash balance</h2>
                <p className="hint">
                  P10 = worst case · P50 = likely case · P90 = best case
                </p>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart
                    data={result.monthlyPercentiles}
                    margin={{ top: 10, right: 20, bottom: 10, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="month"
                      label={{ value: 'Month', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      width={60}
                    />
                    <Tooltip
                      formatter={(value, name) => [currency(value), name]}
                      labelFormatter={(label) => `Month ${label}`}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="p90"
                      name="Best case (P90)"
                      stroke="#22a06b"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="p50"
                      name="Likely (P50)"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="p10"
                      name="Worst case (P10)"
                      stroke="#dc2626"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {!result && !error && (
            <div className="card placeholder">
              Fill in the form and run a simulation to see your cash flow risk.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
