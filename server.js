const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Database connection - use Internal URL on Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize database tables
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        position VARCHAR(100),
        store VARCHAR(255) NOT NULL,
        profile_key VARCHAR(500) UNIQUE NOT NULL,
        first_seen TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP DEFAULT NOW(),
        sessions INTEGER DEFAULT 1
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cert_scores (
        id SERIAL PRIMARY KEY,
        profile_key VARCHAR(500) NOT NULL,
        phase INTEGER NOT NULL,
        mc_ok BOOLEAN DEFAULT FALSE,
        mc_pct INTEGER DEFAULT 0,
        rp_ok BOOLEAN DEFAULT FALSE,
        rp_score INTEGER DEFAULT 0,
        certified BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(profile_key, phase)
      );
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
}

initDB();

// Serve API key
app.get('/config', (req, res) => {
  res.json({ key: process.env.ANTHROPIC_API_KEY || '' });
});

// Save/update user progress
app.post('/api/progress', async (req, res) => {
  try {
    const { name, position, store, profileKey, scores, sessions } = req.body;
    if (!name || !store || !profileKey) return res.json({ ok: false });

    // Upsert user
    await pool.query(`
      INSERT INTO users (name, position, store, profile_key, last_seen, sessions)
      VALUES ($1, $2, $3, $4, NOW(), $5)
      ON CONFLICT (profile_key) DO UPDATE SET
        last_seen = NOW(),
        sessions = $5,
        position = $2
    `, [name, position || '', store, profileKey, sessions || 1]);

    // Upsert scores for each phase
    if (scores) {
      for (var ph in scores) {
        var s = scores[ph];
        await pool.query(`
          INSERT INTO cert_scores (profile_key, phase, mc_ok, mc_pct, rp_ok, rp_score, certified, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (profile_key, phase) DO UPDATE SET
            mc_ok = $3, mc_pct = $4, rp_ok = $5, rp_score = $6,
            certified = $7, updated_at = NOW()
        `, [profileKey, parseInt(ph), s.mcOk||false, s.mcPct||0, s.rpOk||false, s.rp||0, s.ok||false]);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Progress save error:', err.message);
    res.json({ ok: false, error: err.message });
  }
});

// Load user progress
app.get('/api/progress/:profileKey', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.profileKey);
    const user = await pool.query('SELECT * FROM users WHERE profile_key = $1', [key]);
    if (user.rows.length === 0) return res.json({ found: false });
    const scores = await pool.query('SELECT * FROM cert_scores WHERE profile_key = $1', [key]);
    var scoresObj = {};
    scores.rows.forEach(function(r) {
      scoresObj[r.phase] = { mcOk: r.mc_ok, mcPct: r.mc_pct, rpOk: r.rp_ok, rp: r.rp_score, ok: r.certified };
    });
    res.json({ found: true, user: user.rows[0], scores: scoresObj });
  } catch (err) {
    res.json({ found: false });
  }
});

// Manager dashboard - get all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await pool.query('SELECT * FROM users ORDER BY last_seen DESC');
    const scores = await pool.query('SELECT * FROM cert_scores');
    var scoreMap = {};
    scores.rows.forEach(function(r) {
      if (!scoreMap[r.profile_key]) scoreMap[r.profile_key] = {};
      scoreMap[r.profile_key][r.phase] = { mcOk: r.mc_ok, mcPct: r.mc_pct, rpOk: r.rp_ok, rp: r.rp_score, ok: r.certified };
    });
    var result = users.rows.map(function(u) {
      return { name: u.name, pos: u.position, store: u.store, profileKey: u.profile_key, firstSeen: u.first_seen, lastSeen: u.last_seen, sessions: u.sessions, scores: scoreMap[u.profile_key] || {} };
    });
    res.json(result);
  } catch (err) {
    res.json([]);
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'maice.html'));
});

app.listen(PORT, () => {
  console.log(`M.A.I.C.E. running on port ${PORT}`);
});
