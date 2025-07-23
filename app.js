const express = require('express');
const mysql = require('mysql2/promise');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const app = express();
const port = 8000;
const JWT_SECRET = 'your-super-secret-jwt-key-change-in-production';

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow common file types
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

const pool = mysql.createPool({
    host: 'localhost',
    user: 'wpr',
    password: 'fit2024',
    database: 'wpr2201140040', 
    waitForConnections: true,
    connectionLimit: 10
});

// Enhanced authentication middleware
const authen = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(403).render('403');
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const [users] = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (users.length === 0) {
            res.clearCookie('token');
            return res.status(403).render('403');
        }

        req.user = users[0];
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.clearCookie('token');
        res.status(403).render('403');
    }
};

// API middleware for JSON responses
const apiAuth = async (req, res, next) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const [users] = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        req.user = users[0];
        next();
    } catch (error) {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

app.get('/', async (req, res) => {
    const token = req.cookies.token;
    if (token) {
        try {
            jwt.verify(token, JWT_SECRET);
            res.redirect('/inbox');
        } catch (error) {
            res.clearCookie('token');
            res.render('signin');
        }
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
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.render('signin', { error: 'Invalid email or password' });
        }

        const user = users[0];
        const isValid = await bcrypt.compare(password, user.password);
        
        if (!isValid) {
            return res.render('signin', { error: 'Invalid email or password' });
        }

        // Update last login
        await pool.query(
            'UPDATE users SET lastLogin = NOW() WHERE id = ?',
            [user.id]
        );

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { 
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        });
        
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

        const hashedPassword = await bcrypt.hash(password, 12);
        
        await pool.query(
            'INSERT INTO users (fullName, email, password) VALUES (?, ?, ?)',
            [fullName, email, hashedPassword]
        );

        res.render('signup_success', { 
            success: 'Account created successfully! You can now sign in.' 
        });
    } catch (error) {
        console.error('Sign-up error:', error);
        res.status(500).send('Server error');
    }
});

// Enhanced inbox with search and filters
app.get('/inbox', authen, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const filter = req.query.filter || 'all';
        const sort = req.query.sort || 'newest';

        let whereClause = 'WHERE e.recipientId = ? AND e.deletedByRecipient = 0';
        let params = [req.user.id];

        if (search) {
            whereClause += ' AND (u.fullName LIKE ? OR e.subject LIKE ? OR e.body LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (filter === 'unread') {
            whereClause += ' AND e.isRead = 0';
        } else if (filter === 'attachments') {
            whereClause += ' AND e.attachment IS NOT NULL';
        } else if (filter === 'important') {
            whereClause += ' AND e.isImportant = 1';
        }

        let orderClause = 'ORDER BY ';
        switch (sort) {
            case 'oldest':
                orderClause += 'e.createdAt ASC';
                break;
            case 'sender':
                orderClause += 'u.fullName ASC';
                break;
            case 'subject':
                orderClause += 'e.subject ASC';
                break;
            default:
                orderClause += 'e.createdAt DESC';
        }

        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM emails e 
             JOIN users u ON e.senderId = u.id 
             ${whereClause}`,
            params
        );
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        const [emails] = await pool.query(
            `SELECT e.*, u.fullName as senderName, u.avatar as senderAvatar
             FROM emails e 
             JOIN users u ON e.senderId = u.id 
             ${whereClause} 
             ${orderClause}
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        // Get unread count
        const [unreadResult] = await pool.query(
            'SELECT COUNT(*) as unread FROM emails WHERE recipientId = ? AND deletedByRecipient = 0 AND isRead = 0',
            [req.user.id]
        );

        res.render('inbox', {
            user: req.user,
            emails,
            currentPage: page,
            totalPages,
            total,
            search,
            filter,
            sort,
            limit,
            unreadCount: unreadResult[0].unread
        });
    } catch (error) {
        console.error('Inbox error:', error);
        res.status(500).send('Server error');
    }
});

// Enhanced outbox
app.get('/outbox', authen, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const sort = req.query.sort || 'newest';

        let whereClause = 'WHERE e.senderId = ? AND e.deletedBySender = 0';
        let params = [req.user.id];

        if (search) {
            whereClause += ' AND (u.fullName LIKE ? OR e.subject LIKE ? OR e.body LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        let orderClause = 'ORDER BY ';
        switch (sort) {
            case 'oldest':
                orderClause += 'e.createdAt ASC';
                break;
            case 'recipient':
                orderClause += 'u.fullName ASC';
                break;
            case 'subject':
                orderClause += 'e.subject ASC';
                break;
            default:
                orderClause += 'e.createdAt DESC';
        }

        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM emails e 
             JOIN users u ON e.recipientId = u.id 
             ${whereClause}`,
            params
        );
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        const [emails] = await pool.query(
            `SELECT e.*, u.fullName as recipientName, u.avatar as recipientAvatar
             FROM emails e 
             JOIN users u ON e.recipientId = u.id 
             ${whereClause} 
             ${orderClause}
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.render('outbox', {
            user: req.user,
            emails,
            currentPage: page,
            totalPages,
            total,
            search,
            sort,
            limit
        });
    } catch (error) {
        console.error('Outbox error:', error);
        res.status(500).send('Server error');
    }
});

// Enhanced compose with draft functionality
app.get('/compose', authen, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT id, fullName, email, avatar FROM users WHERE id != ?',
            [req.user.id]
        );

        // Get drafts
        const [drafts] = await pool.query(
            'SELECT * FROM drafts WHERE userId = ? ORDER BY updatedAt DESC LIMIT 5',
            [req.user.id]
        );

        res.render('compose', { user: req.user, users, drafts });
    } catch (error) {
        console.error('Compose error:', error);
        res.status(500).send('Server error');
    }
});

app.post('/compose', authen, upload.single('attachment'), async (req, res) => {
    const { recipient, subject, body, priority, scheduleDate } = req.body;
    const attachment = req.file;

    try {
        if (!recipient) {
            const [users] = await pool.query(
                'SELECT id, fullName, email, avatar FROM users WHERE id != ?',
                [req.user.id]
            );
            return res.render('compose', {
                user: req.user,
                users,
                drafts: [],
                error: 'Please select a recipient'
            });
        }

        const emailData = {
            senderId: req.user.id,
            recipientId: recipient,
            subject: subject || null,
            body: body || null,
            attachment: attachment ? attachment.path : null,
            attachmentName: attachment ? attachment.originalname : null,
            priority: priority || 'normal',
            scheduledFor: scheduleDate ? new Date(scheduleDate) : null
        };

        if (emailData.scheduledFor && emailData.scheduledFor > new Date()) {
            // Schedule email
            await pool.query(
                `INSERT INTO scheduled_emails (senderId, recipientId, subject, body, attachment, attachmentName, priority, scheduledFor) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                Object.values(emailData)
            );
            
            const [users] = await pool.query(
                'SELECT id, fullName, email, avatar FROM users WHERE id != ?',
                [req.user.id]
            );

            return res.render('compose', {
                user: req.user,
                users,
                drafts: [],
                success: 'Email scheduled successfully'
            });
        } else {
            // Send immediately
            await pool.query(
                `INSERT INTO emails (senderId, recipientId, subject, body, attachment, attachmentName, priority) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [emailData.senderId, emailData.recipientId, emailData.subject, emailData.body, 
                 emailData.attachment, emailData.attachmentName, emailData.priority]
            );

            const [users] = await pool.query(
                'SELECT id, fullName, email, avatar FROM users WHERE id != ?',
                [req.user.id]
            );

            res.render('compose', {
                user: req.user,
                users,
                drafts: [],
                success: 'Email sent successfully'
            });
        }
    } catch (error) {
        console.error('Send email error:', error);
        res.status(500).send('Server error');
    }
});

// Enhanced email detail view
app.get('/email/:id', authen, async (req, res) => {
    try {
        const [emails] = await pool.query(
            `SELECT e.*, 
                    s.fullName as senderName, s.email as senderEmail, s.avatar as senderAvatar,
                    r.fullName as recipientName, r.email as recipientEmail, r.avatar as recipientAvatar
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

        const email = emails[0];

        // Mark as read if recipient is viewing
        if (email.recipientId === req.user.id && !email.isRead) {
            await pool.query(
                'UPDATE emails SET isRead = 1, readAt = NOW() WHERE id = ?',
                [req.params.id]
            );
            email.isRead = 1;
        }

        // Get conversation thread
        const [thread] = await pool.query(
            `SELECT e.*, 
                    s.fullName as senderName, s.email as senderEmail, s.avatar as senderAvatar,
                    r.fullName as recipientName, r.email as recipientEmail
             FROM emails e
             JOIN users s ON e.senderId = s.id
             JOIN users r ON e.recipientId = r.id
             WHERE ((e.senderId = ? AND e.recipientId = ?) OR (e.senderId = ? AND e.recipientId = ?))
             AND e.subject LIKE ?
             ORDER BY e.createdAt ASC`,
            [email.senderId, email.recipientId, email.recipientId, email.senderId, `%${email.subject || ''}%`]
        );

        res.render('email-detail', {
            user: req.user,
            email,
            thread: thread.length > 1 ? thread : []
        });
    } catch (error) {
        console.error('Email detail error:', error);
        res.status(500).send('Server error');
    }
});

// API endpoints
app.post('/api/emails/mark-read', apiAuth, async (req, res) => {
    const { emailIds } = req.body;
    try {
        await pool.query(
            'UPDATE emails SET isRead = 1, readAt = NOW() WHERE id IN (?) AND recipientId = ?',
            [emailIds, req.user.id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/emails/mark-important', apiAuth, async (req, res) => {
    const { emailIds, important } = req.body;
    try {
        await pool.query(
            'UPDATE emails SET isImportant = ? WHERE id IN (?) AND (senderId = ? OR recipientId = ?)',
            [important ? 1 : 0, emailIds, req.user.id, req.user.id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/emails/delete', apiAuth, async (req, res) => {
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

// Save draft
app.post('/api/drafts/save', apiAuth, async (req, res) => {
    const { recipient, subject, body } = req.body;
    try {
        await pool.query(
            'INSERT INTO drafts (userId, recipient, subject, body) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE subject = ?, body = ?, updatedAt = NOW()',
            [req.user.id, recipient, subject, body, subject, body]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Settings page
app.get('/settings', authen, (req, res) => {
    res.render('settings', { user: req.user });
});

app.post('/settings/profile', authen, upload.single('avatar'), async (req, res) => {
    const { fullName, signature } = req.body;
    const avatar = req.file;

    try {
        let query = 'UPDATE users SET fullName = ?, signature = ?';
        let params = [fullName, signature];

        if (avatar) {
            query += ', avatar = ?';
            params.push(avatar.path);
        }

        query += ' WHERE id = ?';
        params.push(req.user.id);

        await pool.query(query, params);
        res.redirect('/settings?success=Profile updated successfully');
    } catch (error) {
        console.error('Update profile error:', error);
        res.redirect('/settings?error=Failed to update profile');
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

app.get('/signout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

// Create uploads directory
(async () => {
    try {
        await fs.mkdir('uploads', { recursive: true });
        await fs.mkdir('uploads/avatars', { recursive: true });
    } catch (error) {
        console.error('Error creating uploads directories:', error);
    }
})();

app.listen(port, () => {
    console.log(`Enhanced Email Server running at http://localhost:${port}`);
});