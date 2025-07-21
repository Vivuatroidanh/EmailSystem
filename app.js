const express = require('express');
const mysql = require('mysql2/promise');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');

const app = express();
const port = 8000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const pool = mysql.createPool({
    host: 'localhost',
    user: 'wpr',
    password: 'fit2024',
    database: 'wpr2201140040', 
    waitForConnections: true,
    connectionLimit: 10
});

const authen = async (req, res, next) => {
    try {
        const userId = req.cookies.userId;
        if (!userId) {
            return res.status(403).render('403');
        }

        const [users] = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            res.clearCookie('userId');
            return res.status(403).render('403');
        }

        req.user = users[0];
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).send('Server error');
    }
};

app.get('/', async (req, res) => {
    const userId = req.cookies.userId;
    if (userId) {
        res.redirect('/inbox');
    } else {
        res.render('signin');
    }
});

app.get('/signin', (req, res) => {
    res.render('signin');
});

app.post('/signin', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? AND password = ?',
            [email, password]
        );

        if (users.length === 0) {
            return res.render('signin', { error: 'Invalid email or password' });
        }

        res.cookie('userId', users[0].id, { maxAge: 24 * 60 * 60 * 1000 }); 
        res.redirect('/inbox');
    } catch (error) {
        console.error('Sign-in error:', error);
        res.status(500).send('Server error');
    }
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', async (req, res) => {
    const { fullName, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.render('signup', { error: 'Passwords do not match' });
    }
    if (password.length < 6) {
        return res.render('signup', { error: 'Password must be at least 6 characters' });
    }

    try {
        const [existingUsers] = await pool.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            return res.render('signup', { error: 'Email already exists' });
        }

        await pool.query(
            'INSERT INTO users (fullName, email, password) VALUES (?, ?, ?)',
            [fullName, email, password]
        );

        res.render('signup_success', { 
            success: 'Account created successfully! You can now sign in.' 
        });
    } catch (error) {
        console.error('Sign-up error:', error);
        res.status(500).send('Server error');
    }
});

app.get('/inbox', authen, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const offset = (page - 1) * limit;

        const [countResult] = await pool.query(
            'SELECT COUNT(*) as total FROM emails WHERE recipientId = ? AND deletedByRecipient = 0',
            [req.user.id]
        );
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        const [emails] = await pool.query(
            `SELECT e.*, u.fullName as senderName 
             FROM emails e 
             JOIN users u ON e.senderId = u.id 
             WHERE e.recipientId = ? AND e.deletedByRecipient = 0 
             ORDER BY e.createdAt DESC 
             LIMIT ? OFFSET ?`,
            [req.user.id, limit, offset]
        );

        res.render('inbox', {
            user: req.user,
            emails,
            currentPage: page,
            totalPages
        });
    } catch (error) {
        console.error('Inbox error:', error);
        res.status(500).send('Server error');
    }
});

app.get('/outbox', authen, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const offset = (page - 1) * limit;

        const [countResult] = await pool.query(
            'SELECT COUNT(*) as total FROM emails WHERE senderId = ? AND deletedBySender = 0',
            [req.user.id]
        );
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        const [emails] = await pool.query(
            `SELECT e.*, u.fullName as recipientName 
             FROM emails e 
             JOIN users u ON e.recipientId = u.id 
             WHERE e.senderId = ? AND e.deletedBySender = 0 
             ORDER BY e.createdAt DESC 
             LIMIT ? OFFSET ?`,
            [req.user.id, limit, offset]
        );

        res.render('outbox', {
            user: req.user,
            emails,
            currentPage: page,
            totalPages
        });
    } catch (error) {
        console.error('Outbox error:', error);
        res.status(500).send('Server error');
    }
});

app.get('/compose', authen, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT id, fullName, email FROM users WHERE id != ?',
            [req.user.id]
        );

        res.render('compose', { user: req.user, users });
    } catch (error) {
        console.error('Compose error:', error);
        res.status(500).send('Server error');
    }
});

app.post('/compose', authen, upload.single('attachment'), async (req, res) => {
    const { recipient, subject, body } = req.body;
    const attachment = req.file;

    try {
        if (!recipient) {
            const [users] = await pool.query(
                'SELECT id, fullName, email FROM users WHERE id != ?',
                [req.user.id]
            );
            return res.render('compose', {
                user: req.user,
                users,
                error: 'Please select a recipient'
            });
        }

        await pool.query(
            `INSERT INTO emails (senderId, recipientId, subject, body, attachment, attachmentName) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                req.user.id,
                recipient,
                subject || null,
                body || null,
                attachment ? attachment.path : null,
                attachment ? attachment.originalname : null
            ]
        );

        const [users] = await pool.query(
            'SELECT id, fullName, email FROM users WHERE id != ?',
            [req.user.id]
        );

        res.render('compose', {
            user: req.user,
            users,
            success: 'Email sent successfully'
        });
    } catch (error) {
        console.error('Send email error:', error);
        res.status(500).send('Server error');
    }
});

app.get('/email/:id', authen, async (req, res) => {
    try {
        const [emails] = await pool.query(
            `SELECT e.*, 
                    s.fullName as senderName, s.email as senderEmail,
                    r.fullName as recipientName, r.email as recipientEmail
             FROM emails e
             JOIN users s ON e.senderId = s.id
             JOIN users r ON e.recipientId = r.id
             WHERE e.id = ? 
             AND (
                (e.senderId = ? AND e.deletedBySender = 0)
                OR 
                (e.recipientId = ? AND e.deletedByRecipient = 0)
             )`,
            [req.params.id, req.user.id, req.user.id]
        );

        if (emails.length === 0) {
            return res.status(404).send('Email not found');
        }

        res.render('email-detail', {
            user: req.user,
            email: emails[0]
        });
    } catch (error) {
        console.error('Email detail error:', error);
        res.status(500).send('Server error');
    }
});

app.get('/download/:id', authen, async (req, res) => {
    try {
        const [emails] = await pool.query(
            `SELECT * FROM emails 
             WHERE id = ? 
             AND (senderId = ? OR recipientId = ?)`,
            [req.params.id, req.user.id, req.user.id]
        );

        if (emails.length === 0 || !emails[0].attachment) {
            return res.status(404).send('Attachment not found');
        }

        const email = emails[0];
        res.download(email.attachment, email.attachmentName);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).send('Server error');
    }
});

app.post('/api/emails/delete', authen, async (req, res) => {
    const { emailIds } = req.body;

    try {
        for (const emailId of emailIds) {
            const [emails] = await pool.query(
                'SELECT * FROM emails WHERE id = ?',
                [emailId]
            );

            if (emails.length === 0) continue;

            const email = emails[0];
            if (email.senderId === req.user.id) {
                await pool.query(
                    'UPDATE emails SET deletedBySender = 1 WHERE id = ?',
                    [emailId]
                );
            } else if (email.recipientId === req.user.id) {
                await pool.query(
                    'UPDATE emails SET deletedByRecipient = 1 WHERE id = ?',
                    [emailId]
                );
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete emails error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/signout', (req, res) => {
    res.clearCookie('userId');
    res.redirect('/');
});

(async () => {
    try {
        await fs.mkdir('uploads', { recursive: true });
    } catch (error) {
        console.error('Error creating uploads directory:', error);
    }
})();

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});