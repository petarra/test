const express = require("express");
const router = express.Router();
const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const methodOverride = require('method-override');

// Database (.env)
require('dotenv').config();
const dbConfig = ({
    host: process.env.DB_HOST, 
    user: process.env.DB_USER, 
    password: process.env.DB_PASS,
    database: process.env.DB_NAME, 
    port: 3306,
    multipleStatements: true,
    connectionLimit: 15,
    queueLimit: 0
  });

const connection = mysql.createConnection(dbConfig);
    connection.connect((err) => {
        if (err) {
        console.error('Error connecting to the database:', err);
        return;
        }
        console.log('Connected to the MySQL database.');
});

const credential = {
    user: "admin",
    password: "hytam"
}

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

//base
router.get('/base', (req, res) => {
    res.render('base')
})

// login user
router.post('/base', (req, res) => {
    if (req.body.user == credential.user && req.body.password == credential.password) {
        req.session.user = req.body.user;
        res.redirect('/admin');
        //res.end("Login Successful...!");
    } else {
        res.send("Invalid Username or Password")
    }
});

//DASHBOARD ROUTE
router.all('/admin', (req, res) => {
    if (req.session.user) {
        let table = req.query.table || 'tangki'; // Default table
        if (req.method === 'POST' && req.body.table) {
            table = req.body.table;
        }
        
        connection.query(`SELECT * FROM ${table}`, (err, rows) => {
            if (err) {
                console.error('Error querying the database:', err);
                return res.status(500).send('Database query failed');
            }
            res.render('dashboard', { user: req.session.user, table: table, data: rows });
        });
    } else {
        res.send("Unauthorized User");
    }
});

// Add data to table
router.post('/add', upload.single('fileimage'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!req.session.user) {
        return res.status(401).send('Unauthorized User');
    }

    const { table, name } = req.body;
    const img = `assets/product/${req.file.filename}`;

    // Check if img already exists in the table
    connection.query(`SELECT * FROM ${table} WHERE img = ?`, [img], (err, result) => {
        if (err) {
            console.error('Error querying the database:', err);
            return res.status(500).send('Database query failed');
        }

        if (result.length > 0) {
            return res.status(400).json({ message: 'Image already being used' });
        }

        // Proceed with insertion if img is unique
        connection.query(`INSERT INTO ${table} (name, img) VALUES (?, ?)`, [name, img], (err, result) => {
            if (err) {
                console.error('Error inserting into the database:', err);
                return res.status(500).send('Database insert failed');
            }
            res.redirect(`/admin?table=${table}`);
        });
    });
});


// Update data in table
router.post('/update', upload.single('newimage'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const { table, id, name } = req.body;
    const finder = `SELECT img FROM ${table} WHERE id = ?`;
    connection.query(`SELECT img FROM ${table} WHERE id = ?`, [id], (err,results) => {
        const imgpath = path.join(__dirname, 'public', results[0].img);
        fs.unlink(imgpath, (err) => {
            if (err) {
                console.error('Error deleting image file:', err);
                return;
            }
        });
    })

    const img = `assets/product/${req.file.filename}`;
    connection.query(`UPDATE ${table} SET name = ?, img = ? WHERE id = ?`, [name, img, id], (err, result) => {
        if (err) {
            console.error('Error updating the database:', err);
            return res.status(500).send('Database update failed');
        }
        res.redirect(`/admin?table=${table}`);
    });
});

// Delete data from table
router.post('/delete', async (req, res) => {
    const { table, id, img } = req.body;
    const imgpath = path.join(__dirname, 'public', img);
    fs.unlink(imgpath, (err) => {
        if (err) {
            console.error('Error deleting image file:', err);
            return;
        }
    });

    connection.query(`DELETE FROM ${table} WHERE id = ?`, [id], (err, result) => {
        if (err) {
            console.error('Error deleting from the database:', err);
            return res.status(500).send('Database delete failed');
        }
        res.redirect(`/admin?table=${table}`);
    });
});

// Read (Product)
router.get('/product', (req, res) => {
    connection.query('SELECT * FROM tangki', (err, rows) => {
        if (err){
            console.error('Error querying the database:', err);
            return res.status(500).send('Database query failed');
        }
        res.render('product', { tangki: rows });
    })
})

// Read (Pipa)
router.get('/pipa', (req, res) => {
    connection.query('SELECT * FROM pipa', (err, rows) => {
        if (err){
            console.error('Error querying the database:', err);
            return res.status(500).send('Database query failed');
        }
        res.render('pipa', { tangki: rows });
    })
})

// Read (Sambungan)
router.get('/sambungan', (req, res) => {
    connection.query('SELECT * FROM sambungan', (err, rows) => {
        if (err){
            console.error('Error querying the database:', err);
            return res.status(500).send('Database query failed');
        }
        res.render('sambungan', { tangki: rows });
    })
})

// Read (Saringan)
router.get('/saringan', (req, res) => {
    connection.query('SELECT * FROM bahan_saringan', (err, rows) => {
        if (err){
            console.error('Error querying the database:', err);
            return res.status(500).send('Database query failed');
        }
        res.render('saringan', { tangki: rows });
    })
})

// Search (Dashboard)
router.get('/dashboardSearch', (req, res) => {
    const searchTerm = req.query.term;
    const table = req.query.table;
    connection.query(`SELECT * FROM ${table} WHERE name LIKE ? OR img LIKE ?`, [`%${searchTerm}%`, `%${searchTerm}%`], (err, rows) => {                                                                                                             if (err) {
        console.error('Error querying the database:', err);
        return res.status(500).send('Database query failed');
      }
      res.render('dashboard', { user: req.session.user, table: table, data: rows });
    });
});

router.get('/search', (req, res) => {
    const searchTerm = req.query.term;
    const query = 'SELECT * FROM tangki where name LIKE ? UNION SELECT * FROM pipa where name LIKE ? UNION SELECT * FROM bahan_saringan where name LIKE ? UNION SELECT * FROM sambungan where name LIKE ?'
    connection.query(query, [`%${searchTerm}%`, `%${searchTerm}%` , `%${searchTerm}%` , `%${searchTerm}%`], (err, rows) => {                                                                                                              if (err) {
        console.error('Error querying the database:', err);
        return res.status(500).send('Database query failed');
      }
      res.render('search', { user: req.session.user, data: rows });
    });
});

// route for logout
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