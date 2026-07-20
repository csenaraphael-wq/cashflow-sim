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
const SENSITIVITY_URL = `${API_BASE}/api/sensitivity`;

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
  const [sensitivity, setSensitivity] = useState(null);
  const [sensError, setSensError] = useState(null);
  const [sensLoading, setSensLoading] = useState(false);

  // The exact payload used for the last run, so "What matters most?" analyzes
  // the same scenario the results on screen were produced from.
  const [lastPayload, setLastPayload] = useState(null);

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
    // A fresh run invalidates any previous sensitivity analysis.
    setSensitivity(null);
    setSensError(null);

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
      setLastPayload(payload);
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

  async function handleSensitivity() {
    if (!lastPayload) return;
    setSensError(null);
    setSensitivity(null);
    setSensLoading(true);

    try {
      const res = await fetch(SENSITIVITY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastPayload),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.details ? `: ${data.details.join(', ')}` : '';
        throw new Error((data.error || 'Request failed') + detail);
      }
      setSensitivity(data);
    } catch (err) {
      setSensError(
        err.message === 'Failed to fetch'
          ? 'Could not reach the API. Is the server running on http://localhost:3001?'
          : err.message
      );
    } finally {
      setSensLoading(false);
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
                    <XAxis
                      dataKey="month"
                      stroke="#898781"
                      tick={{ fill: '#52514e', fontSize: 12 }}
                      tickLine={false}
                      axisLine={{ stroke: '#e1e0d9' }}
                      label={{ value: 'Month', position: 'insideBottom', offset: -5, fill: '#898781', fontSize: 12 }}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      width={60}
                      stroke="#898781"
                      tick={{ fill: '#52514e', fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value, name) => [currency(value), name]}
                      labelFormatter={(label) => `Month ${label}`}
                      contentStyle={{
                        borderRadius: 10,
                        border: '1px solid rgba(11,11,11,0.08)',
                        boxShadow: '0 4px 16px -6px rgba(11,11,11,0.12)',
                        fontSize: 13,
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="p90"
                      name="Best case (P90)"
                      stroke="#949492"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="p50"
                      name="Likely (P50)"
                      stroke="#111111"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="p10"
                      name="Worst case (P10)"
                      stroke="#5c5c5a"
                      strokeWidth={2}
                      strokeDasharray="2 3"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="card sensitivity-card">
                <h2>What matters most?</h2>
                <p className="hint">
                  See which input has the biggest effect on your risk of running
                  out of cash.
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={handleSensitivity}
                  disabled={sensLoading}
                >
                  {sensLoading ? 'Analyzing…' : 'What matters most?'}
                </button>

                {sensError && <div className="card error">{sensError}</div>}

                {sensitivity && (
                  <ol className="sensitivity-list">
                    {sensitivity.ranked.map((item) => {
                      const max = sensitivity.ranked[0].impactScore || 1;
                      const widthPct = Math.max(
                        2,
                        (item.impactScore / max) * 100
                      );
                      return (
                        <li key={item.input} className="sensitivity-row">
                          <div className="sensitivity-label">{item.label}</div>
                          <div className="sensitivity-bar-track">
                            <div
                              className="sensitivity-bar"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                          <div className="sensitivity-score">
                            {item.impactScore} pts
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {sensitivity && (
                  <p className="hint">
                    Impact = how much your chance of running out of cash swings
                    (in percentage points) when that input moves, holding
                    everything else fixed.
                  </p>
                )}
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
