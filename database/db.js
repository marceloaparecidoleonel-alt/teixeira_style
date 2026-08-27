const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'teixeira.db');
const db = new sqlite3.Database(dbPath);

// Promisify database operations
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize database schema
async function initDatabase() {
  // Enable foreign keys
  await dbRun('PRAGMA foreign_keys = ON');

  // Admin users table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Categories table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      image_url TEXT,
      product_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Products table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      category_id INTEGER,
      reference_code TEXT,
      description TEXT,
      sizes TEXT,
      image_url TEXT,
      availability TEXT DEFAULT 'available',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    )
  `);

  // Contacts table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      city TEXT,
      interest TEXT,
      contact_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT
    )
  `);

  // Gallery images table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      url TEXT NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create default admin user if not exists
  const adminExists = await dbGet('SELECT COUNT(*) as count FROM admin_users');
  if (adminExists.count === 0) {
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    await dbRun('INSERT INTO admin_users (username, password) VALUES (?, ?)', ['admin', hashedPassword]);
    console.log('Default admin user created (username: admin, password: admin123)');
  }

  // Create default categories if not exists
  const catCount = await dbGet('SELECT COUNT(*) as count FROM categories');
  if (catCount.count === 0) {
    const defaultCategories = [
      { name: 'Masculino', slug: 'masculino' },
      { name: 'Feminino', slug: 'feminino' },
      { name: 'Camisetas', slug: 'camisetas' },
      { name: 'Moletons', slug: 'moletons' },
      { name: 'Bonés', slug: 'bones' },
      { name: 'Calças', slug: 'calcas' },
      { name: 'Jaquetas', slug: 'jaquetas' },
      { name: 'Acessórios', slug: 'acessorios' }
    ];
    
    for (const cat of defaultCategories) {
      await dbRun('INSERT INTO categories (name, slug) VALUES (?, ?)', [cat.name, cat.slug]);
    }
    console.log('Default categories created');
  }

  // Create default products if not exists
  const prodCount = await dbGet('SELECT COUNT(*) as count FROM products');
  if (prodCount.count === 0) {
    const cats = await dbAll('SELECT id, slug FROM categories');
    const catMap = {};
    cats.forEach(c => { catMap[c.slug] = c.id; });

    const defaultProducts = [
      { name: 'Camiseta Oversize Preta', slug: 'camiseta-oversize-preta', catSlug: 'camisetas', ref: 'CAM-001', sizes: 'P,M,G,GG', img: 'assets/images/camiseta.png' },
      { name: 'Moletom Essential Cinza', slug: 'moletom-essential-cinza', catSlug: 'moletons', ref: 'MOL-001', sizes: 'M,G,GG,XG', img: 'assets/images/camiseta2.png' },
      { name: 'Boné Trucker Branco', slug: 'bone-trucker-branco', catSlug: 'bones', ref: 'BON-001', sizes: 'Único', img: 'assets/images/camiseta.png' },
      { name: 'Calça Cargo Bege', slug: 'calca-cargo-bege', catSlug: 'calcas', ref: 'CAL-001', sizes: '38,40,42,44', img: 'assets/images/camiseta2.png' },
      { name: 'Jaqueta Corta-Vento Preta', slug: 'jaqueta-corta-vento-preta', catSlug: 'jaquetas', ref: 'JAQ-001', sizes: 'P,M,G', img: 'assets/images/camiseta.png' },
      { name: 'Camiseta Cropped Branca', slug: 'camiseta-cropped-branca', catSlug: 'camisetas', ref: 'CAM-002', sizes: 'P,M,G', img: 'assets/images/camiseta2.png' },
      { name: 'Moletom Cropped Nude', slug: 'moletom-cropped-nude', catSlug: 'moletons', ref: 'MOL-002', sizes: 'P,M,G', img: 'assets/images/camiseta.png', availability: 'unavailable' },
      { name: 'Mochila Streetwear Preta', slug: 'mochila-streetwear-preta', catSlug: 'acessorios', ref: 'ACE-001', sizes: 'Único', img: 'assets/images/camiseta2.png' }
    ];

    for (const p of defaultProducts) {
      await dbRun(
        'INSERT INTO products (name, slug, category_id, reference_code, sizes, image_url, availability, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [p.name, p.slug, catMap[p.catSlug] || null, p.ref, p.sizes, p.img, p.availability || 'available', 'active']
      );
    }
    console.log('Default products created');
  }
}

// Initialize on module load
initDatabase().catch(err => console.error('Database initialization error:', err));

module.exports = { db, dbRun, dbGet, dbAll };
