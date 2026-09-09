import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const DB_FILE = process.env.DB_FILE || './data/messages.db';
fs.mkdirSync('./data', { recursive: true });
const db = await open({ filename: DB_FILE, driver: sqlite3.Database });
await db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 code TEXT UNIQUE NOT NULL,
 name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 sender_id INTEGER NOT NULL,
 receiver_id INTEGER NOT NULL,
 body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 delivered INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(sender_id) REFERENCES users(id),
 FOREIGN KEY(receiver_id) REFERENCES users(id)
);
`);

function tokenFor(user) { return jwt.sign({ id: user.id, code: user.code, name: user.name }, JWT_SECRET, { expiresIn: '30d' }); }
function auth(req, res, next) {
  try { req.user = jwt.verify((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'رمز الدخول غير صالح أو منتهي' }); }
}
function makeCode() { return String(Math.floor(10000 + Math.random() * 90000)); }
async function uniqueCode() { let c; do { c = makeCode(); } while (await db.get('SELECT id FROM users WHERE code=?', c)); return c; }

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_, res) => res.json({ ok: true, service: 'messaging-server', time: new Date().toISOString() }));

app.post('/api/auth/register', async (req, res) => {
  const { name, password } = req.body || {};
  if (!name || String(name).trim().length < 2 || !password || String(password).length < 4) return res.status(400).json({ error: 'أدخل اسمًا وكلمة مرور صحيحة' });
  const code = await uniqueCode();
  const hash = await bcrypt.hash(String(password), 12);
  const result = await db.run('INSERT INTO users(code,name,password_hash) VALUES(?,?,?)', code, String(name).trim(), hash);
  const user = { id: result.lastID, code, name: String(name).trim() };
  res.json({ user, token: tokenFor(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { code, password } = req.body || {};
  const user = await db.get('SELECT * FROM users WHERE code=?', String(code || ''));
  if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) return res.status(401).json({ error: 'الرمز أو كلمة المرور غير صحيحة' });
  const safe = { id: user.id, code: user.code, name: user.name };
  res.json({ user: safe, token: tokenFor(safe) });
});

app.get('/api/users/:code', auth, async (req, res) => {
  const user = await db.get('SELECT id,code,name,created_at FROM users WHERE code=?', req.params.code);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json({ user });
});

app.get('/api/messages/:code', auth, async (req, res) => {
  const other = await db.get('SELECT id FROM users WHERE code=?', req.params.code);
  if (!other) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const rows = await db.all(`SELECT m.id,m.body,m.created_at,m.sender_id,m.receiver_id,u.code sender_code
    FROM messages m JOIN users u ON u.id=m.sender_id
    WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)
    ORDER BY m.id ASC`, req.user.id, other.id, other.id, req.user.id);
  await db.run('UPDATE messages SET delivered=1 WHERE sender_id=? AND receiver_id=?', other.id, req.user.id);
  res.json({ messages: rows });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || '*' } });
const online = new Map();
io.use((socket, next) => { try { socket.user = jwt.verify(socket.handshake.auth?.token, JWT_SECRET); next(); } catch { next(new Error('unauthorized')); } });
io.on('connection', socket => {
  online.set(socket.user.id, socket.id);
  socket.on('send_message', async (payload, cb = () => {}) => {
    try {
      const code = String(payload?.to || ''); const body = String(payload?.body || '').trim();
      if (!body || body.length > 5000) return cb({ ok:false, error:'الرسالة فارغة أو طويلة جدًا' });
      const receiver = await db.get('SELECT id,code,name FROM users WHERE code=?', code);
      if (!receiver) return cb({ ok:false, error:'المستلم غير موجود' });
      const result = await db.run('INSERT INTO messages(sender_id,receiver_id,body) VALUES(?,?,?)', socket.user.id, receiver.id, body);
      const message = { id: result.lastID, body, sender_id: socket.user.id, receiver_id: receiver.id, sender_code: socket.user.code, created_at: new Date().toISOString() };
      const receiverSocket = online.get(receiver.id); if (receiverSocket) io.to(receiverSocket).emit('new_message', message);
      cb({ ok:true, message });
    } catch { cb({ ok:false, error:'تعذر إرسال الرسالة' }); }
  });
  socket.on('disconnect', () => { if (online.get(socket.user.id) === socket.id) online.delete(socket.user.id); });
}):

server.listen(PORT, '0.0.0.0', () => console.log(`Messaging server running on port ${PORT}`));
