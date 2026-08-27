const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Get all categories
router.get('/', async (req, res) => {
  try {
    const categories = await dbAll('SELECT * FROM categories ORDER BY name ASC');
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get single category
router.get('/:id', async (req, res) => {
  try {
    const category = await dbGet('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(category);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// Create category (protected)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, image_url } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const result = await dbRun(`
      INSERT INTO categories (name, slug, description, image_url)
      VALUES (?, ?, ?, ?)
    `, [name, slug, description || null, image_url || null]);

    const category = await dbGet('SELECT * FROM categories WHERE id = ?', [result.lastID]);
    res.status(201).json(category);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Category with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category (protected)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, description, image_url } = req.body;

    const existing = await dbGet('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const slug = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : existing.slug;

    await dbRun(`
      UPDATE categories 
      SET name = COALESCE(?, name),
          slug = ?,
          description = COALESCE(?, description),
          image_url = COALESCE(?, image_url),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, slug, description || null, image_url || null, req.params.id]);

    const category = await dbGet('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category (protected)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const existing = await dbGet('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if category has products
    const productCount = await dbGet('SELECT COUNT(*) as count FROM products WHERE category_id = ?', [req.params.id]);
    if (productCount.count > 0) {
      return res.status(400).json({ error: 'Cannot delete category with products' });
    }

    await dbRun('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
