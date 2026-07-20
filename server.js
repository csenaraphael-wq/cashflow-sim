/**
 * Cash Flow Risk Simulator — API layer
 * Built with Node's built-in http module (zero dependencies) so it runs anywhere.
 * Swapping this to Express later is a ~10 line change if you want route middleware,
 * but this works as-is for a single endpoint.
 */

const http = require('http');
const { simulateCashFlow, analyzeSensitivity } = require('./simulate');

const PORT = process.env.PORT || 3001;

const VALID_VARIABILITY = ['steady', 'somewhat_variable', 'very_variable'];

function validateInput(body) {
  const errors = [];

  if (typeof body.startingCashBalance !== 'number') {
    errors.push('startingCashBalance must be a number');
  }
  if (typeof body.avgMonthlyIncome !== 'number' || body.avgMonthlyIncome <= 0) {
    errors.push('avgMonthlyIncome must be a positive number');
  }
  if (!VALID_VARIABILITY.includes(body.incomeVariability)) {
    errors.push(`incomeVariability must be one of: ${VALID_VARIABILITY.join(', ')}`);
  }
  if (typeof body.avgMonthlyExpenses !== 'number' || body.avgMonthlyExpenses <= 0) {
    errors.push('avgMonthlyExpenses must be a positive number');
  }
  if (!VALID_VARIABILITY.includes(body.expenseVariability)) {
    errors.push(`expenseVariability must be one of: ${VALID_VARIABILITY.join(', ')}`);
  }
  if (body.knownUpcomingExpenses && !Array.isArray(body.knownUpcomingExpenses)) {
    errors.push('knownUpcomingExpenses must be an array');
  }
  if (body.monthsToSimulate && (typeof body.monthsToSimulate !== 'number' || body.monthsToSimulate < 1 || body.monthsToSimulate > 60)) {
    errors.push('monthsToSimulate must be a number between 1 and 60');
  }

  return errors;
}

const server = http.createServer((req, res) => {
  // Basic CORS so a local frontend dev server can call this without issues
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/simulate') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
        return;
      }

      const errors = validateInput(parsed);
      if (errors.length > 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid input', details: errors }));
        return;
      }

      // FREE TIER LIMIT: cap free requests to a 3-month forecast.
      // Once Supabase auth is wired up, check the user's plan here and only
      // allow monthsToSimulate up to 12 (or whatever) for paid users.
      const isPaidUser = false; // placeholder until auth is added
      const requestedMonths = parsed.monthsToSimulate || 12;
      const monthsToSimulate = isPaidUser ? requestedMonths : Math.min(requestedMonths, 3);

      try {
        const result = simulateCashFlow({ ...parsed, monthsToSimulate });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...result, tierLimited: !isPaidUser && requestedMonths > 3 }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Simulation failed', message: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/sensitivity') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
        return;
      }

      const errors = validateInput(parsed);
      if (errors.length > 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid input', details: errors }));
        return;
      }

      // Apply the same free-tier month cap as /api/simulate so the sensitivity
      // analysis is consistent with the forecast the user sees.
      const isPaidUser = false; // placeholder until auth is added
      const requestedMonths = parsed.monthsToSimulate || 12;
      const monthsToSimulate = isPaidUser ? requestedMonths : Math.min(requestedMonths, 3);

      try {
        const result = analyzeSensitivity({ ...parsed, monthsToSimulate });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...result, tierLimited: !isPaidUser && requestedMonths > 3 }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Sensitivity analysis failed', message: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Cash flow simulator API running on http://localhost:${PORT}`);
  console.log(`Try: POST http://localhost:${PORT}/api/simulate`);
});

module.exports = { server };
