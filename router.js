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

const connection = mysql.createConnection(dbConfig);
    connection.connect((err) => {
        if (err) {
        console.error('Error connecting to the database:', err);
        return;
        }
        console.log('Connected to the MySQL database.');
});

// Create a connection pool
const pool = mysql.createPool(dbConfig);
const query = promisify(pool.query).bind(pool);
const getConnection = promisify(pool.getConnection).bind(pool);

// multer for local storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // Max file size is 5MB
  },
});

// Middleware to check if user is authenticated
const authenticateUser = (req, res, next) => {
    if (req.session.user) {
        next(); 
    } else {
        res.redirect('/base'); 
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
router.post('/login', (req, res) => {
    const { user, password, remember } = req.body;
    if (user === 'admin' && password === 'hytam') {
        req.session.user = user;
        if (remember) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        } else {
            req.session.cookie.expires = false; // Browser session
        }
        res.redirect('/admin');
    } else {
        res.redirect('/base');
    }
});

// Dashboard route
router.all('/admin', async (req, res) => {
    let table = req.query.table || 'tangki';
    if (req.method === 'POST' && req.body.table) {
        table = req.body.table;
    }

    try {
        const rows = await query(`SELECT * FROM ${table}`);
        res.render('dashboard', { table: table, data: rows });
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

    const { table, name } = req.body;
    const img = req.file.originalname;

    try {
        // Get a connection from the pool
        const connection = await getConnection();

        // Check if the image already exists
        const result = await query(`SELECT * FROM ${table} WHERE img = ?`, [img]);

        if (result.length > 0) {
            connection.release();
            return res.status(400).json({ message: 'Image already being used' });
        }

        // Upload the image to Firebase Storage
        const file = bucket.file(img);
        const stream = file.createWriteStream({
            metadata: {
                contentType: req.file.mimetype,
            },
        });

        stream.on('error', (err) => {
            console.error('Error uploading file:', err);
            connection.release();
            res.status(500).send('Error uploading file.');
        });

        stream.on('finish', async () => {
            try {
                // Proceed with insertion if img is unique and upload successful
                await query(`INSERT INTO ${table} (name, img) VALUES (?, ?)`, [name, img]);
                connection.release();
                res.redirect(`/admin?table=${table}`);
            } catch (err) {
                console.error('Error inserting into the database:', err);
                connection.release();
                res.status(500).send('Database insert failed');
            }
        });

        stream.end(req.file.buffer);

    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).send('Database query failed');
    }
});

// Update data in table
router.post('/update/:imageName', upload.single('newimage'), (req, res) => {
    try {
        const { table, id, name } = req.body;

        // If no new image uploaded, just update the name
        if (!req.file) {
            pool.query(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, id], (err, result) => {
                if (err) {
                    console.error('Error updating MySQL database:', err);
                    res.status(500).send('MySQL update failed');
                } else {
                    res.redirect(`/admin?table=${table}`);
                }
            });
        } else {
            const delImage = req.params.imageName;
            const del = bucket.file(delImage);

            // Delete old image from Firebase Storage
            del.delete((err, apiResponse) => {
                if (err) {
                    console.error('Error deleting old image from Firebase:', err);
                    return res.status(500).send('Error deleting old image from Firebase.');
                }

                const imageName = req.file.originalname;
                // Upload new image to Firebase Storage
                const file = bucket.file(imageName);
                const stream = file.createWriteStream({
                    metadata: {
                        contentType: req.file.mimetype,
                    },
                });

                stream.on('error', (err) => {
                    console.error('Error uploading file:', err);
                    res.status(500).send('Error uploading file.');
                });

                stream.on('finish', () => {
                    // Update record in MySQL database
                    pool.query(`UPDATE ${table} SET name = ?, img = ? WHERE id = ?`, [name, imageName, id], (err, result) => {
                        if (err) {
                            console.error('Error updating MySQL database:', err);
                            res.status(500).send('MySQL update failed');
                        } else {
                            res.redirect(`/admin?table=${table}`);
                        }
                    });
                });

                stream.end(req.file.buffer);
            });
        }
    } catch (err) {
        console.error('Error updating:', err);
        res.status(500).send('Update operation failed.');
    }
});



// Delete data from table
router.post('/delete/:imageName', async (req, res) => {
    const { table, id } = req.body;
    const fileName = req.params.imageName;

    const file = bucket.file(fileName);

    try {
        // Check if the file exists in Firebase Storage
        const [exists] = await file.exists();
        if (!exists) {
            return res.status(404).send('File not found.');
        }

        // Delete the file from Firebase Storage
        await file.delete();

        // Delete the corresponding record from the MySQL database table
        await new Promise((resolve, reject) => {
            pool.query(`DELETE FROM ${table} WHERE id = ?`, [id], (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        res.redirect(`/admin?table=${table}`);
    } catch (err) {
        console.error('Error deleting file or record:', err);
        res.status(500).send('Delete operation failed.');
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
router.get('/dashboardSearch', async (req, res) => {
    const searchTerm = req.query.term;
    const table = req.query.table;
    try {
        const rows = await query(`SELECT * FROM ${table} WHERE name LIKE ? OR img LIKE ?`, [`%${searchTerm}%`, `%${searchTerm}%`]);
        res.render('dashboard', { table: table, data: rows });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).send('Database query failed');
    }
});

// Search across all tables
router.get('/search', async (req, res) => {
    const searchTerm = req.query.term;
    const sql = `
        SELECT * FROM tangki WHERE name LIKE ? 
        UNION 
        SELECT * FROM pipa WHERE name LIKE ? 
        UNION 
        SELECT * FROM bahan_saringan WHERE name LIKE ? 
        UNION 
        SELECT * FROM sambungan WHERE name LIKE ?`;

    try {
        const rows = await query(sql, [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]);
        res.render('search', { user: req.session.user, data: rows });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).send('Database query failed');
    }
});



// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            res.status(500).send('Error logging out');
        } else {
            res.redirect('/base');
        }
    });
});

module.exports = router;
