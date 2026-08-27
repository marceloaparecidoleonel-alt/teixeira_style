const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { dbAll, dbGet, dbRun } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'assets', 'images', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Get all gallery images
router.get('/', async (req, res) => {
  try {
    const images = await dbAll('SELECT * FROM gallery ORDER BY uploaded_at DESC');
    res.json(images);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch gallery images' });
  }
});

// Upload image (protected)
router.post('/upload', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const imageUrl = `/assets/images/uploads/${req.file.filename}`;

  try {
    const result = await dbRun(`
      INSERT INTO gallery (filename, original_name, url)
      VALUES (?, ?, ?)
    `, [req.file.filename, req.file.originalname, imageUrl]);

    const image = await dbGet('SELECT * FROM gallery WHERE id = ?', [result.lastID]);
    res.status(201).json(image);
  } catch (err) {
    // Delete file if database insert fails
    fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to save image' });
  }
});

// Delete image (protected)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const image = await dbGet('SELECT * FROM gallery WHERE id = ?', [req.params.id]);
    
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Delete file from filesystem
    const filePath = path.join(__dirname, '..', 'assets', 'images', 'uploads', image.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await dbRun('DELETE FROM gallery WHERE id = ?', [req.params.id]);
    
    res.json({ message: 'Image deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

module.exports = router;
