const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

/* API Routes — substituídos por Firebase (client-side Firestore + Auth + Storage)
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/contacts',   require('./routes/contacts'));
app.use('/api/gallery',    require('./routes/gallery'));
*/

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/catalogo', (req, res) => {
  res.sendFile(path.join(__dirname, 'catalogo.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
