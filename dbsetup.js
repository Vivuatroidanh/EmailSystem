const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function setupDatabase() {
    const connect = await mysql.createConnection({
        host: 'localhost',
        user: 'wpr', // Replace with your MySQL username
        password: 'fit2024' // Replace with your MySQL password
    });

    try {
        await connect.query('CREATE DATABASE IF NOT EXISTS wpr2201140040');
        await connect.query('USE wpr2201140040');
        
        // Drop existing tables
        await connect.query('DROP TABLE IF EXISTS scheduled_emails');
        await connect.query('DROP TABLE IF EXISTS drafts');
        await connect.query('DROP TABLE IF EXISTS emails');
        await connect.query('DROP TABLE IF EXISTS users');

        // Enhanced users table
        await connect.query(`
            CREATE TABLE users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                fullName VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                avatar VARCHAR(255) DEFAULT NULL,
                signature TEXT DEFAULT NULL,
                theme VARCHAR(50) DEFAULT 'light',
                language VARCHAR(10) DEFAULT 'en',
                timezone VARCHAR(50) DEFAULT 'UTC',
                notificationsEnabled BOOLEAN DEFAULT TRUE,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                lastLogin TIMESTAMP NULL,
                isActive BOOLEAN DEFAULT TRUE
            )
        `);

        // Enhanced emails table
        await connect.query(`
            CREATE TABLE emails (
                id INT PRIMARY KEY AUTO_INCREMENT,
                senderId INT NOT NULL,
                recipientId INT NOT NULL,
                subject VARCHAR(500),
                body TEXT,
                attachment VARCHAR(255),
                attachmentName VARCHAR(255),
                attachmentSize INT DEFAULT 0,
                priority ENUM('low', 'normal', 'high') DEFAULT 'normal',
                isRead BOOLEAN DEFAULT FALSE,
                isImportant BOOLEAN DEFAULT FALSE,
                readAt TIMESTAMP NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                deletedBySender BOOLEAN DEFAULT FALSE,
                deletedByRecipient BOOLEAN DEFAULT FALSE,
                isSpam BOOLEAN DEFAULT FALSE,
                threadId VARCHAR(100) DEFAULT NULL,
                replyToId INT DEFAULT NULL,
                FOREIGN KEY (senderId) REFERENCES users(id),
                FOREIGN KEY (recipientId) REFERENCES users(id),
                FOREIGN KEY (replyToId) REFERENCES emails(id),
                INDEX idx_recipient_created (recipientId, createdAt),
                INDEX idx_sender_created (senderId, createdAt),
                INDEX idx_thread (threadId),
                INDEX idx_priority (priority),
                INDEX idx_read_status (isRead)
            )
        `);

        // Drafts table
        await connect.query(`
            CREATE TABLE drafts (
                id INT PRIMARY KEY AUTO_INCREMENT,
                userId INT NOT NULL,
                recipient INT DEFAULT NULL,
                subject VARCHAR(500),
                body TEXT,
                attachment VARCHAR(255),
                attachmentName VARCHAR(255),
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users(id),
                FOREIGN KEY (recipient) REFERENCES users(id)
            )
        `);

        // Scheduled emails table
        await connect.query(`
            CREATE TABLE scheduled_emails (
                id INT PRIMARY KEY AUTO_INCREMENT,
                senderId INT NOT NULL,
                recipientId INT NOT NULL,
                subject VARCHAR(500),
                body TEXT,
                attachment VARCHAR(255),
                attachmentName VARCHAR(255),
                priority ENUM('low', 'normal', 'high') DEFAULT 'normal',
                scheduledFor TIMESTAMP NOT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sent BOOLEAN DEFAULT FALSE,
                sentAt TIMESTAMP NULL,
                FOREIGN KEY (senderId) REFERENCES users(id),
                FOREIGN KEY (recipientId) REFERENCES users(id),
                INDEX idx_scheduled (scheduledFor, sent)
            )
        `);

        // Contacts table
        await connect.query(`
            CREATE TABLE contacts (
                id INT PRIMARY KEY AUTO_INCREMENT,
                userId INT NOT NULL,
                contactUserId INT NOT NULL,
                nickname VARCHAR(255) DEFAULT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users(id),
                FOREIGN KEY (contactUserId) REFERENCES users(id),
                UNIQUE KEY unique_contact (userId, contactUserId)
            )
        `);

        // Email labels/folders table
        await connect.query(`
            CREATE TABLE email_labels (
                id INT PRIMARY KEY AUTO_INCREMENT,
                userId INT NOT NULL,
                emailId INT NOT NULL,
                label VARCHAR(100) NOT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users(id),
                FOREIGN KEY (emailId) REFERENCES emails(id),
                UNIQUE KEY unique_label (userId, emailId, label)
            )
        `);

        // Create enhanced sample users with hashed passwords
        const sampleUsers = [
            { fullName: 'Alex Johnson', email: 'alex@email.com', password: '123456' },
            { fullName: 'Sarah Chen', email: 'sarah@email.com', password: '123456' },
            { fullName: 'Mike Rodriguez', email: 'mike@email.com', password: '123456' },
            { fullName: 'Emma Williams', email: 'emma@email.com', password: '123456' },
            { fullName: 'David Kim', email: 'david@email.com', password: '123456' },
            { fullName: 'Lisa Anderson', email: 'lisa@email.com', password: '123456' },
            { fullName: 'James Wilson', email: 'james@email.com', password: '123456' },
            { fullName: 'Maria Garcia', email: 'maria@email.com', password: '123456' },
            { fullName: 'Ryan Taylor', email: 'ryan@email.com', password: '123456' },
            { fullName: 'Nina Patel', email: 'nina@email.com', password: '123456' }
        ];

        for (const user of sampleUsers) {
            const hashedPassword = await bcrypt.hash(user.password, 12);
            await connect.query(
                'INSERT INTO users (fullName, email, password, signature) VALUES (?, ?, ?, ?)',
                [user.fullName, user.email, hashedPassword, `Best regards,\n${user.fullName}`]
            );
        }

        const [users] = await connect.query('SELECT id FROM users ORDER BY id');
        const userIds = users.map(user => user.id);

        // Enhanced sample emails with various priorities and features
        const sampleEmails = [
            {
                sender: userIds[1], recipient: userIds[0], subject: 'Welcome to the Team!',
                body: 'Hi there!\n\nWelcome to our amazing team! We\'re excited to have you on board. Your first day is going to be fantastic.\n\nLooking forward to working with you!\n\nBest,\nSarah',
                priority: 'high'
            },
            {
                sender: userIds[2], recipient: userIds[0], subject: 'Project Update - Q4 2024',
                body: 'Hey team,\n\nHere\'s our Q4 progress update:\n\n• Database optimization: 95% complete\n• Frontend redesign: 80% complete\n• API improvements: 70% complete\n• Testing phase: Starting next week\n\nOverall, we\'re on track to meet our December deadline. Great work everyone!\n\nMike',
                priority: 'high'
            },
            {
                sender: userIds[3], recipient: userIds[0], subject: 'Meeting Reminder - Tomorrow 2PM',
                body: 'Hi,\n\nJust a quick reminder about our meeting tomorrow at 2PM in Conference Room A.\n\nAgenda:\n1. Review quarterly goals\n2. Discuss new client requirements\n3. Plan next sprint\n\nSee you there!\nEmma',
                priority: 'normal'
            },
            {
                sender: userIds[4], recipient: userIds[0], subject: 'Weekend Plans?',
                body: 'Hey!\n\nAny plans for the weekend? There\'s a new coffee shop downtown that just opened. Want to check it out Saturday morning?\n\nLet me know!\nDavid',
                priority: 'low'
            },
            {
                sender: userIds[5], recipient: userIds[0], subject: 'Code Review Request',
                body: 'Hi,\n\nI\'ve pushed the new authentication module to the dev branch. Could you review it when you get a chance?\n\nKey changes:\n- JWT implementation\n- Password hashing with bcrypt\n- Rate limiting\n- Enhanced security middleware\n\nThanks!\nLisa',
                priority: 'normal'
            },
            {
                sender: userIds[6], recipient: userIds[0], subject: 'URGENT: Server Maintenance Tonight',
                body: 'ATTENTION: Scheduled server maintenance tonight from 11PM to 2AM.\n\nServices affected:\n- Main application\n- Database backups\n- Email notifications\n\nPlease save your work and log out before 11PM.\n\nApologies for any inconvenience.\n\nJames\nIT Department',
                priority: 'high'
            },
            {
                sender: userIds[7], recipient: userIds[0], subject: 'Happy Birthday! 🎉',
                body: 'Happy Birthday!\n\nHope you have a wonderful day filled with joy and celebration. The whole team wishes you the best!\n\nEnjoy your special day!\n\nWith love,\nMaria',
                priority: 'normal'
            },
            {
                sender: userIds[8], recipient: userIds[0], subject: 'Training Session - Next Week',
                body: 'Hi everyone,\n\nWe\'re organizing a training session on the new development tools next Tuesday at 10AM.\n\nTopics covered:\n- Docker containerization\n- CI/CD pipelines\n- Automated testing\n- Performance monitoring\n\nPlease confirm your attendance.\n\nBest,\nRyan',
                priority: 'normal'
            },
            {
                sender: userIds[9], recipient: userIds[0], subject: 'Lunch Meeting Proposal',
                body: 'Hi!\n\nWould you like to grab lunch tomorrow to discuss the new client proposal? I have some ideas I\'d like to share.\n\nHow about that Italian place at 12:30PM?\n\nLet me know!\nNina',
                priority: 'low'
            },
            {
                sender: userIds[0], recipient: userIds[1], subject: 'Thank you for the warm welcome!',
                body: 'Hi Sarah,\n\nThank you so much for the warm welcome message! I\'m really excited to be part of the team and contribute to all the amazing projects.\n\nLooking forward to collaborating with everyone!\n\nBest regards,\nAlex',
                priority: 'normal'
            },
            {
                sender: userIds[0], recipient: userIds[2], subject: 'Re: Project Update - Q4 2024',
                body: 'Hi Mike,\n\nThanks for the detailed update! The progress looks fantastic. I\'m particularly impressed with the database optimization results.\n\nFor the testing phase, should we involve the QA team from day one, or do you prefer to run internal tests first?\n\nLet me know your thoughts.\n\nAlex',
                priority: 'normal'
            },
            {
                sender: userIds[1], recipient: userIds[2], subject: 'Client Feedback on Design Mockups',
                body: 'Hi Mike,\n\nI received feedback from the client on the new design mockups:\n\n✅ Overall layout - Approved\n✅ Color scheme - Approved\n⚠️ Navigation menu - Needs revision\n❌ Mobile responsiveness - Requires significant changes\n\nCan we schedule a call to discuss the required changes?\n\nSarah',
                priority: 'high'
            },
            {
                sender: userIds[3], recipient: userIds[4], subject: 'Weekend Hiking Trip',
                body: 'Hey David,\n\nA group of us are planning a hiking trip this weekend to Mountain View Trail. Want to join?\n\nWe\'re meeting at 7AM Saturday at the parking lot. Bring water, snacks, and comfortable shoes!\n\nLet me know if you\'re interested!\n\nEmma',
                priority: 'low'
            },
            {
                sender: userIds[5], recipient: userIds[6], subject: 'Database Backup Verification',
                body: 'Hi James,\n\nI\'ve completed the weekly database backup verification. All systems are running smoothly:\n\n- Primary backup: ✅ Successful\n- Secondary backup: ✅ Successful\n- Integrity check: ✅ Passed\n- Recovery test: ✅ Completed\n\nBackup files are stored in the secure cloud storage as per protocol.\n\nLisa',
                priority: 'normal'
            },
            {
                sender: userIds[7], recipient: userIds[8], subject: 'New Recipe to Try!',
                body: 'Hey Ryan,\n\nI tried that amazing pasta recipe you shared last week - it was incredible! My family loved it.\n\nI found another great recipe for chocolate chip cookies. Want me to bring some to the office tomorrow?\n\nThanks for sharing your cooking expertise!\n\nMaria',
                priority: 'low'
            }
        ];

        // Insert sample emails with timestamps spread over the last few days
        for (let i = 0; i < sampleEmails.length; i++) {
            const email = sampleEmails[i];
            const timestamp = new Date();
            timestamp.setHours(timestamp.getHours() - (i * 2)); // Spread emails over time

            await connect.query(`
                INSERT INTO emails (senderId, recipientId, subject, body, priority, createdAt, isRead, isImportant)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                email.sender,
                email.recipient,
                email.subject,
                email.body,
                email.priority,
                timestamp,
                Math.random() > 0.7 ? 1 : 0, // 30% chance of being read
                Math.random() > 0.9 ? 1 : 0  // 10% chance of being important
            ]);
        }

        // Create some sample drafts
        const sampleDrafts = [
            {
                userId: userIds[0], recipient: userIds[1], subject: 'Follow-up on our discussion',
                body: 'Hi Sarah,\n\nI wanted to follow up on our discussion about...'
            },
            {
                userId: userIds[0], recipient: userIds[3], subject: 'Project proposal draft',
                body: 'Hi Emma,\n\nI\'ve been working on the project proposal and wanted to get your thoughts...'
            }
        ];

        for (const draft of sampleDrafts) {
            await connect.query(`
                INSERT INTO drafts (userId, recipient, subject, body)
                VALUES (?, ?, ?, ?)
            `, [draft.userId, draft.recipient, draft.subject, draft.body]);
        }

        // Create some sample contacts
        for (let i = 0; i < userIds.length; i++) {
            for (let j = 0; j < userIds.length; j++) {
                if (i !== j && Math.random() > 0.5) { // 50% chance of being contacts
                    try {
                        await connect.query(`
                            INSERT INTO contacts (userId, contactUserId)
                            VALUES (?, ?)
                        `, [userIds[i], userIds[j]]);
                    } catch (error) {
                        // Ignore duplicate key errors
                    }
                }
            }
        }

        console.log('✅ Enhanced database setup completed successfully!');
        console.log('\n🔐 Sample user credentials (all passwords: 123456):');
        console.log('1. Email: alex@email.com');
        console.log('2. Email: sarah@email.com');
        console.log('3. Email: mike@email.com');
        console.log('4. Email: emma@email.com');
        console.log('5. Email: david@email.com');
        console.log('\n🚀 New features added:');
        console.log('• Enhanced security with JWT and bcrypt');
        console.log('• Email priorities (low, normal, high)');
        console.log('• Read/unread status tracking');
        console.log('• Important email marking');
        console.log('• Draft saving functionality');
        console.log('• Scheduled email sending');
        console.log('• Contact management');
        console.log('• Email threading support');
        console.log('• Advanced search and filtering');
        console.log('• User avatars and signatures');
        console.log('• Rate limiting and security enhancements');

    } catch (error) {
        console.error('❌ Error setting up database:', error);
    } finally {
        await connect.end();
    }
}

setupDatabase().catch(console.error);