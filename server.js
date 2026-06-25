const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 8080;

// Serve a config endpoint that injects the API key securely
app.get('/config', (req, res) => {
  res.json({ key: process.env.ANTHROPIC_API_KEY || '' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'maice.html'));
});

app.listen(PORT, () => {
  console.log(`M.A.I.C.E. running on port ${PORT}`);
});
