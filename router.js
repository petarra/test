const express = require("express");
const router = express.Router();
const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { promisify } = require('util');
const bucket = require('./firebase');

// Database (.env)
require('dotenv').config();

// MySQL database configuration
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    multipleStatements: true,
    connectionLimit: 15,
    queueLimit: 0
};

// Create a connection pool
const pool = mysql.createPool(dbConfig);

// Promisify query method to use async/await
const query = promisify(pool.query).bind(pool);

// multer for local storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public', 'assets', 'product'));
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// Middleware to check if user is authenticated
const authenticateUser = (req, res, next) => {
    if (req.session.user) {
        next(); // User authenticated, proceed to next middleware/route handler
    } else {
        res.send("Unauthorized User");
    }
};

// Home
router.get('/', (req, res) => {
    res.render('index');
});

router.get('/index', (req, res) => {
    res.render('index');
});

// About
router.get('/about', (req, res) => {
    res.render('about');
});

// Contact
router.get('/contact', (req, res) => {
    res.render('contact');
});

// Login page
router.get('/base', (req, res) => {
    res.render('base')
})

// Login user
router.post('/base', (req, res) => {
    const { user, password } = req.body;
    if (user === 'admin' && password === 'hytam') {
        req.session.user = user;
        res.redirect('/admin');
    } else {
        res.send("Invalid Username or Password");
    }
});

// Dashboard route
router.all('/admin', authenticateUser, async (req, res) => {
    let table = req.query.table || 'tangki'; // Default table
    if (req.method === 'POST' && req.body.table) {
        table = req.body.table;
    }

    try {
        const rows = await query(`SELECT * FROM ${table}`);
        res.render('dashboard', { user: req.session.user, table: table, data: rows });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).send('Database query failed');
    }
});

router.get('/image/:imageName', (req, res) => {
    const imageName = req.params.imageName;
    const file = bucket.file(imageName);
  
    file.createReadStream()
      .on('error', (err) => {
        res.status(500).send('Error retrieving image from Firebase Storage: ' + err.message);
      })
      .pipe(res);
  });

// Add data to table
router.post('/add', upload.single('fileimage'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!req.session.user) {
        return res.status(401).send('Unauthorized User');
    }

    const { table, name } = req.body;
    const file = bucket.file(`assets/product/${req.file.originalname}`);

    try {
        await file.save(req.file.buffer, {
            metadata: { contentType: req.file.mimetype }
        });

        const img = `https://firebasestorage.googleapis.com/v0/b/${process.env.FIREBASE_STORAGE_BUCKET}/o/assets%2Fproduct%2F${encodeURIComponent(req.file.originalname)}?alt=media`;

        const [rows] = await pool.query(`SELECT * FROM ${table} WHERE img = ?`, [img]);

        if (rows.length > 0) {
            return res.status(400).json({ message: 'Image already being used' });
        }

        await pool.query(`INSERT INTO ${table} (name, img) VALUES (?, ?)`, [name, img]);
        res.redirect(`/admin?table=${table}`);
    } catch (err) {
        console.error('Error uploading to Firebase:', err);
        res.status(500).send('Firebase upload failed');
    }
});

// Update data in table
router.post('/update', upload.single('newimage'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const { table, id, name } = req.body;
    const file = bucket.file(`assets/product/${req.file.originalname}`);

    try {
        await file.save(req.file.buffer, {
            metadata: { contentType: req.file.mimetype }
        });

        const img = `https://firebasestorage.googleapis.com/v0/b/${process.env.FIREBASE_STORAGE_BUCKET}/o/assets%2Fproduct%2F${encodeURIComponent(req.file.originalname)}?alt=media`;

        await pool.query(`UPDATE ${table} SET name = ?, img = ? WHERE id = ?`, [name, img, id]);
        res.redirect(`/admin?table=${table}`);
    } catch (err) {
        console.error('Error uploading to Firebase:', err);
        res.status(500).send('Firebase upload failed');
    }
});

// Delete data from table
router.post('/delete', async (req, res) => {
    const { table, id, img } = req.body;
    const fileName = decodeURIComponent(path.basename(img));

    const file = bucket.file(`assets/product/${fileName}`);

    try {
        await file.delete();

        await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
        res.redirect(`/admin?table=${table}`);
    } catch (err) {
        console.error('Error deleting file from Firebase:', err);
        res.status(500).send('Firebase delete failed');
    }
});

// Read (Product)
router.get('/product', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM tangki');
        res.render('product', { tangki: rows });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).send('Database query failed');
    }
});

// Read (Pipa)
router.get('/pipa', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM pipa');
        res.render('pipa', { tangki: rows });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).send('Database query failed');
    }
});

// Read (Sambungan)
router.get('/sambungan', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM sambungan');
        res.render('sambungan', { tangki: rows });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).send('Database query failed');
    }
});

// Read (Saringan)
router.get('/saringan', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM bahan_saringan');
        res.render('saringan', { tangki: rows });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).send('Database query failed');
    }
});

// Search (Dashboard)
router.get('/dashboardSearch', authenticateUser, async (req, res) => {
    const searchTerm = req.query.term;
    const table = req.query.table;
    try {
        const rows = await query(`SELECT * FROM ${table} WHERE name LIKE ? OR img LIKE ?`, [`%${searchTerm}%`, `%${searchTerm}%`]);
        res.render('dashboard', { user: req.session.user, table: table, data: rows });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).send('Database query failed');
    }
});

// Search across all tables
router.get('/search', authenticateUser, async (req, res) => {
    const searchTerm = req.query.term;
    const query = 'SELECT * FROM tangki WHERE name LIKE ? UNION SELECT * FROM pipa WHERE name LIKE ? UNION SELECT * FROM bahan_saringan WHERE name LIKE ? UNION SELECT * FROM sambungan WHERE name LIKE ?';
    try {
        const rows = await query(query, [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]);
        res.render('search', { user: req.session.user, data: rows });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).send('Database query failed');
    }
});


// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
            res.send("Error logging out");
        } else {
            res.redirect('/base'); // Redirect to login page or appropriate route
        }
    });
});

module.exports = router;
