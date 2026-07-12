const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(cors({
  origin: [
    'https://frarolpu.github.io',
    /^http:\/\/localhost(:\d+)?$/,
  ],
}));
app.use(express.json());

// Create table on first run
pool.query(`
  CREATE TABLE IF NOT EXISTS logbook (
    id         SERIAL PRIMARY KEY,
    date       DATE    NOT NULL,
    time       TIME    NOT NULL,
    medication TEXT    NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_logbook_date ON logbook(date);
`).catch(err => console.error('Table init error:', err.message));

// GET /entries?date=YYYY-MM-DD
app.get('/entries', async (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'date param required (YYYY-MM-DD)' });
  try {
    const { rows } = await pool.query(
      `SELECT id, date, time::text, medication
       FROM logbook WHERE date = $1
       ORDER BY time ASC, id ASC`,
      [date]
    );
    res.json(rows);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /entries  body: { date, time, medication }
app.post('/entries', async (req, res) => {
  const { date, time, medication } = req.body ?? {};
  if (!date || !time || !medication?.trim())
    return res.status(400).json({ error: 'date, time and medication are required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time))
    return res.status(400).json({ error: 'time must be HH:MM' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO logbook (date, time, medication)
       VALUES ($1, $2, $3)
       RETURNING id, date, time::text, medication`,
      [date, time, medication.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /entries/:id
app.delete('/entries/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ error: 'Invalid id' });
  try {
    await pool.query('DELETE FROM logbook WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Database error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rutinasana API running on port ${PORT}`));
