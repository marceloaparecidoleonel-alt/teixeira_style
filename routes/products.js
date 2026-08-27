const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Get all products
router.get('/', async (req, res) => {
  try {
    const { category, search, status } = req.query;
    
    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      query += ' AND c.slug = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (p.name LIKE ? OR p.reference_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }

    query += ' ORDER BY p.created_at DESC';

    const products = await dbAll(query, params);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await dbGet(`
      SELECT p.*, c.name as category_name, c.slug as category_slug 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.id = ?
    `, [req.params.id]);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create product (protected)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, category_id, reference_code, description, sizes, image_url, availability, status } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const result = await dbRun(`
      INSERT INTO products (name, slug, category_id, reference_code, description, sizes, image_url, availability, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, slug, category_id || null, reference_code || null, description || null, sizes || null, image_url || null, availability || 'available', status || 'active']);

    // Update category product count
    if (category_id) {
      await dbRun('UPDATE categories SET product_count = product_count + 1 WHERE id = ?', [category_id]);
    }

    const product = await dbGet('SELECT * FROM products WHERE id = ?', [result.lastID]);
    res.status(201).json(product);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Product with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product (protected)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, category_id, reference_code, description, sizes, image_url, availability, status } = req.body;

    const existing = await dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const slug = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : existing.slug;

    await dbRun(`
      UPDATE products 
      SET name = COALESCE(?, name),
          slug = ?,
          category_id = COALESCE(?, category_id),
          reference_code = COALESCE(?, reference_code),
          description = COALESCE(?, description),
          sizes = COALESCE(?, sizes),
          image_url = COALESCE(?, image_url),
          availability = COALESCE(?, availability),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, slug, category_id || null, reference_code || null, description || null, sizes || null, image_url || null, availability || 'available', status || 'active', req.params.id]);

    const product = await dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product (protected)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const existing = await dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await dbRun('DELETE FROM products WHERE id = ?', [req.params.id]);

    // Update category product count
    if (existing.category_id) {
      await dbRun('UPDATE categories SET product_count = product_count - 1 WHERE id = ?', [existing.category_id]);
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
