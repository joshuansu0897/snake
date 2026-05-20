const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'qtable.json');

// Enable CORS for frontend requests
app.use(cors());
// Set limits to handle large Q-tables without payload errors
app.use(express.json({ limit: '50mb' }));

// Helper to read database file
function readQTable() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data || '{}');
    }
  } catch (err) {
    console.error('Error reading Q-table file:', err);
  }
  return {};
}

// Helper to write database file
function writeQTable(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing Q-table file:', err);
    return false;
  }
}

// GET Endpoint to fetch global Q-table
app.get('/qtable', (req, res) => {
  console.log(`[${new Date().toLocaleTimeString()}] GET /qtable - Fetching weights...`);
  const qTable = readQTable();
  res.json(qTable);
});

// PUT Endpoint to update/merge global Q-table
app.put('/qtable', (req, res) => {
  console.log(`[${new Date().toLocaleTimeString()}] PUT /qtable - Syncing weights...`);
  const newQTable = req.body;
  if (!newQTable || typeof newQTable !== 'object') {
    return res.status(400).json({ error: 'Invalid Q-table payload' });
  }

  const success = writeQTable(newQTable);
  if (success) {
    res.json({ success: true, message: 'Q-table synced successfully' });
  } else {
    res.status(500).json({ error: 'Failed to write Q-table storage' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log('==================================================');
  console.log(`🚀 Snake AI Federated Sync Server is active!`);
  console.log(`📍 Endpoint URL: http://localhost:${PORT}/qtable`);
  console.log(`📂 Storage file: ${DB_FILE}`);
  console.log('==================================================');
});
