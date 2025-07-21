const mysql = require('mysql2/promise');

async function setupDatabase() {
    // Ket noi sql
    const connect = await mysql.createConnection({
        host: 'localhost',
        user: 'your_username', // Replace with your MySQL username
        password: 'your_userpassword' // Replace with your MySQL password
    });

    try {
        await connect.query('CREATE DATABASE IF NOT EXISTS wpr2201140040');
        await connect.query('USE wpr2201140040');
        await connect.query('DROP TABLE IF EXISTS emails');
        await connect.query('DROP TABLE IF EXISTS users');

        await connect.query(`
            CREATE TABLE users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                fullName VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            )
        `);

        await connect.query(`
            CREATE TABLE emails (
                id INT PRIMARY KEY AUTO_INCREMENT,
                senderId INT NOT NULL,
                recipientId INT NOT NULL,
                subject VARCHAR(255),
                body TEXT,
                attachment VARCHAR(255),
                attachmentName VARCHAR(255),
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                deletedBySender BOOLEAN DEFAULT FALSE,
                deletedByRecipient BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (senderId) REFERENCES users(id),
                FOREIGN KEY (recipientId) REFERENCES users(id)
            )
        `);

        const [userResult] = await connect.query(`
            INSERT INTO users (fullName, email, password) VALUES
            ('Nguyen Van A', 'a@a.com', '123'),
            ('Trieu Van', 'b@b.com', '123'),
            ('Nguyen Minh Duc', 'c@c.com', '123'),
            ('Duong Van Minh', 'd@d.com', '123'),
            ('Tran Duc Anh', 'e@e.com', '123'),
            ('Hoang An', 'f@f.com', '123'),
            ('Pham Duy Anh', 'g@g.com', '123'),
            ('Nguyen Trung Hieu', 'h@h.com', '123'),
            ('Vu Anh Tuyet', 'i@i.com', '123'),
            ('Le Ngoc Sang', 'j@j.com', '123')
        `);

        const [users] = await connect.query('SELECT id FROM users ORDER BY id');
        const userIds = users.map(user => user.id);

        const sampleEmails = [
            {
                sender: userIds[1], 
                recipient: userIds[0], 
                subject: 'Play',
                body: 'Mai di choi nhe. Hen ban o cong vien'
            },
            {
                sender: userIds[2], 
                recipient: userIds[0], 
                subject: 'Project Update',
                body: 'MonggoDB: delivers unprecedented performance for your workloads compared with previous versions. While precise gains will vary from application to application, industry benchmarks and MongoDB\'s internal testing indicate the following improvements vs MongoDB 7.0'
            },
            {
                sender: userIds[3], 
                recipient: userIds[0], 
                subject: 'Project Update 2.0',
                body: 'We have prepared some useful information to help you apply the great functionalities of our tools to your daily development, and assist you to better manage your licenses.'
            },
            {
                sender: userIds[4],
                recipient: userIds[0],
                subject: 'Project Update 3.0',
                body: 'Hi, here\'s the latest update on the project. We\'re making good progress!'
            },
            {
                sender: userIds[5], 
                recipient: userIds[0], 
                subject: 'Meeting Tomorrow',
                body: 'Can we schedule a meeting tomorrow at 2 PM?'
            },
            {
                sender: userIds[6], 
                recipient: userIds[0], 
                subject: 'Weekly Report',
                body: 'Please find attached the weekly report.'
            },
            {
                sender: userIds[7], 
                recipient: userIds[0], 
                subject: 'Play 2.0',
                body: 'Ngay mai ban ranh khong, toi qua nha ban choi nhe.'
            },
            {
                sender: userIds[8], 
                recipient: userIds[0], 
                subject: 'Project Update',
                body: 'We\'ve channeled our psionic energy to change your Discord account password. Gonna go get a seltzer to calm down.'
            },
            {
                sender: userIds[0],
                recipient: userIds[1], 
                subject: 'Project Update',
                body: 'I\'m beyond excited to share some massive news with you! Our team at BLACKBOX AI has been working day and night to bring you an innovation that will transform the way you interact with GitHub.'
            },
            {
                sender: userIds[6],
                recipient: userIds[1], 
                subject: 'Project Update',
                body: 'Exclusive updates: Be the first to know about new features, improvements, and upcoming events.'
            },
            {
                sender: userIds[7], 
                recipient: userIds[1], 
                subject: 'Meeting Tomorrow',
                body: 'Valuable tips and tricks: Learn how to maximize your use of Blackbox AI and get the most out of our platform.'
            },
            {
                sender: userIds[8], 
                recipient: userIds[2], 
                subject: 'Weekly Report',
                body: 'Community engagement: Connect with other Blackbox AI users, share your experiences, and get support from our team.'
            },
            {
                sender: userIds[9], 
                recipient: userIds[2], 
                subject: 'Re: Project Update',
                body: 'We are making these changes to support our expanding business, clarify our terms, and ensure their continued transparency for your benefit. We strongly urge you to thoroughly read the Service Terms and Privacy Policy in their entirety, but here is a summary of the key updates:'
            },
            {
                sender: userIds[0],
                recipient: userIds[2], 
                subject: 'Re: Meeting Tomorrow',
                body: '2 PM works for me. See you then!'
            },
            {
                sender: userIds[2],
                recipient: userIds[3], 
                subject: 'Lunch Plans',
                body: 'Want to grab lunch today?'
            },
            {
                sender: userIds[1],
                recipient: userIds[3], 
                subject: 'Re: Lunch Plans',
                body: 'Sure, how about 12:30 at the usual place?'
            },
            {
                sender: userIds[0], 
                recipient: userIds[3], 
                subject: 'Document Review',
                body: 'We\’ve clarified that the QuillBot Services are not meant for users under the age of 16.'
            }
        ];

        for (let i = 0; i < sampleEmails.length; i++) {
            const email = sampleEmails[i];
            const timestamp = new Date();
            timestamp.setHours(timestamp.getHours() - i); 

            await connect.query(`
                INSERT INTO emails (senderId, recipientId, subject, body, createdAt)
                VALUES (?, ?, ?, ?, ?)
            `, [
                email.sender,
                email.recipient,
                email.subject,
                email.body,
                timestamp
            ]);
        }

        console.log('Database setup completed successfully!');
        console.log('\nSample user credentials:');
        console.log('1. Email: a@a.com, Password: 123');
        console.log('2. Email: b@b.com, Password: 123');
        console.log('3. Email: c@c.com, Password: 123');

    } catch (error) {
        console.error('Error setting up database:', error);
    } finally {
        await connect.end();
    }
}
setupDatabase().catch(console.error);