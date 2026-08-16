const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'money.json');
const PUBLIC = path.join(__dirname, 'public');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-now';
const START_PASSWORD = process.env.START_PASSWORD || 'minecraft';
const sessions = new Map();

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function initialDb() {
  return {
    users: ['Lucca', 'Conor', 'Rhys'].map(name => ({ name, balance: 1000, passwordHash: hash(START_PASSWORD) })),
    requests: [], transactions: [], nextId: 1
  };
}
function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(initialDb(), null, 2));
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
let db = loadDb();
function save() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function amount(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw new Error('Amount must be a whole number from 1 to 1,000,000.');
  return n;
}
function user(name) { return db.users.find(u => u.name.toLowerCase() === String(name).toLowerCase()); }
function publicState(me) {
  return {
    me: { name: me.name, balance: me.balance },
    users: db.users.map(u => ({ name: u.name, balance: u.balance })),
    requests: db.requests.filter(r => r.status === 'pending' && (r.from === me.name || r.to === me.name)),
    transactions: db.transactions.filter(t => t.from === me.name || t.to === me.name).slice(-20).reverse()
  };
}
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 20_000) throw new Error('Request too large.'); }
  return raw ? JSON.parse(raw) : {};
}
function auth(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const name = sessions.get(token);
  return name && user(name);
}
function transfer(from, to, value, note = '') {
  const n = amount(value);
  if (!to || to.name === from.name) throw new Error('Choose another player.');
  if (from.balance < n) throw new Error('Not enough money.');
  from.balance -= n; to.balance += n;
  db.transactions.push({ id: db.nextId++, from: from.name, to: to.name, amount: n, note: String(note).slice(0, 80), at: new Date().toISOString() });
  save();
}
async function api(req, res) {
  try {
    if (req.method === 'POST' && req.url === '/api/login') {
      const input = await body(req); const account = user(input.name);
      if (!account || account.passwordHash !== hash(String(input.password || ''))) return json(res, 401, { error: 'Wrong name or password.' });
      const token = crypto.randomBytes(24).toString('hex'); sessions.set(token, account.name);
      return json(res, 200, { token, state: publicState(account) });
    }
    const me = auth(req);
    if (!me) return json(res, 401, { error: 'Please log in.' });
    if (req.method === 'GET' && req.url === '/api/state') return json(res, 200, publicState(me));
    if (req.method === 'POST' && req.url === '/api/send') {
      const input = await body(req); transfer(me, user(input.to), input.amount, input.note); return json(res, 200, publicState(me));
    }
    if (req.method === 'POST' && req.url === '/api/request') {
      const input = await body(req); const from = user(input.from); const n = amount(input.amount);
      if (!from || from.name === me.name) throw new Error('Choose another player.');
      db.requests.push({ id: db.nextId++, from: from.name, to: me.name, amount: n, note: String(input.note || '').slice(0, 80), status: 'pending', at: new Date().toISOString() }); save();
      return json(res, 200, publicState(me));
    }
    if (req.method === 'POST' && req.url === '/api/request/respond') {
      const input = await body(req); const request = db.requests.find(r => r.id === Number(input.id) && r.from === me.name && r.status === 'pending');
      if (!request) throw new Error('Request not found.');
      if (input.accept) transfer(me, user(request.to), request.amount, request.note);
      request.status = input.accept ? 'paid' : 'declined'; save(); return json(res, 200, publicState(me));
    }
    if (req.method === 'POST' && req.url === '/api/admin/give') {
      const input = await body(req);
      if (!crypto.timingSafeEqual(Buffer.from(hash(String(input.adminPassword || ''))), Buffer.from(hash(ADMIN_PASSWORD)))) return json(res, 403, { error: 'Wrong admin password.' });
      const to = user(input.to); const n = amount(input.amount); if (!to) throw new Error('Player not found.');
      to.balance += n; db.transactions.push({ id: db.nextId++, from: 'Aetheris Treasury', to: to.name, amount: n, note: 'Admin grant', at: new Date().toISOString() }); save();
      return json(res, 200, publicState(me));
    }
    return json(res, 404, { error: 'Not found.' });
  } catch (error) { return json(res, 400, { error: error.message || 'Something went wrong.' }); }
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return api(req, res);
  const clean = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(PUBLIC, clean);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
if (require.main === module) server.listen(PORT, () => console.log(`Aetheris Money: http://localhost:${PORT}`));
module.exports = { server, initialDb, amount };
