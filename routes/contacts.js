const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Get all contacts
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    
    let query = 'SELECT * FROM contacts WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (name LIKE ? OR phone LIKE ? OR city LIKE ? OR interest LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY contact_date DESC';

    const contacts = await dbAll(query, params);
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Get single contact
router.get('/:id', async (req, res) => {
  try {
    const contact = await dbGet('SELECT * FROM contacts WHERE id = ?', [req.params.id]);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// Create contact
router.post('/', async (req, res) => {
  try {
    const { name, phone, city, interest, notes } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const result = await dbRun(`
      INSERT INTO contacts (name, phone, city, interest, notes)
      VALUES (?, ?, ?, ?, ?)
    `, [name, phone, city || null, interest || null, notes || null]);

    const contact = await dbGet('SELECT * FROM contacts WHERE id = ?', [result.lastID]);
    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// Update contact (protected)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, phone, city, interest, notes } = req.body;

    const existing = await dbGet('SELECT * FROM contacts WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await dbRun(`
      UPDATE contacts 
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          city = COALESCE(?, city),
          interest = COALESCE(?, interest),
          notes = COALESCE(?, notes)
      WHERE id = ?
    `, [name, phone, city || null, interest || null, notes || null, req.params.id]);

    const contact = await dbGet('SELECT * FROM contacts WHERE id = ?', [req.params.id]);
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete contact (protected)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const existing = await dbGet('SELECT * FROM contacts WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await dbRun('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    res.json({ message: 'Contact deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

module.exports = router;
