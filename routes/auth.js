const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun } = require('../database/db');
const { JWT_SECRET } = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }

  try {
    const user = await dbGet('SELECT * FROM admin_users WHERE username = ?', [username]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // TODO: re-enable password check when needed
    // if (!bcrypt.compareSync(password, user.password)) {
    //   return res.status(401).json({ error: 'Invalid credentials' });
    // }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password
router.post('/change-password', async (req, res) => {
  const { username, currentPassword, newPassword } = req.body;

  if (!username || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    const user = await dbGet('SELECT * FROM admin_users WHERE username = ?', [username]);

    if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Invalid current password' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await dbRun('UPDATE admin_users SET password = ? WHERE id = ?', [hashedPassword, user.id]);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
