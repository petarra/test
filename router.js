const express = require("express");
const router = express.Router();
const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { promisify } = require('util');

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

// Routes

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

// Add data to table
router.post('/add', authenticateUser, upload.single('fileimage'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }

        const { table, name } = req.body;
        const img = `assets/product/${req.file.filename}`;

        // Check if img already exists in the table
        const result = await query(`SELECT * FROM ${table} WHERE img = ?`, [img]);
        if (result.length > 0) {
            throw new Error('Image already being used');
        }

        // Proceed with insertion if img is unique
        await query(`INSERT INTO ${table} (name, img) VALUES (?, ?)`, [name, img]);
        res.redirect(`/admin?table=${table}`);
    } catch (err) {
        console.error('Error inserting into the database:', err);
        res.status(500).send('Database insert failed');
    }
});

// Update data in table
router.post('/update', authenticateUser, upload.single('newimage'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }

        const { table, id, name } = req.body;

        // Get current image path for deletion
        const [currentImage] = await query(`SELECT img FROM ${table} WHERE id = ?`, [id]);
        const imgpath = path.join(__dirname, 'public', currentImage.img);
        fs.unlinkSync(imgpath); // Synchronously delete current image file

        const img = `assets/product/${req.file.filename}`;
        await query(`UPDATE ${table} SET name = ?, img = ? WHERE id = ?`, [name, img, id]);
        res.redirect(`/admin?table=${table}`);
    } catch (err) {
        console.error('Error updating the database:', err);
        res.status(500).send('Database update failed');
    }
});

// Delete data from table
router.post('/delete', authenticateUser, async (req, res) => {
    try {
        const { table, id, img } = req.body;
        const imgpath = path.join(__dirname, 'public', img);
        fs.unlinkSync(imgpath); // Synchronously delete image file

        await query(`DELETE FROM ${table} WHERE id = ?`, [id]);
        res.redirect(`/admin?table=${table}`);
    } catch (err) {
        console.error('Error deleting from the database:', err);
        res.status(500).send('Database delete failed');
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
