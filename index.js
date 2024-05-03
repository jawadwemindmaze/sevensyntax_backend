const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const uri = 'mongodb://jawadakhter7:9jEMw6XJjH5nzWq9@ac-uqql9vi-shard-00-00.wrxrpup.mongodb.net:27017,ac-uqql9vi-shard-00-01.wrxrpup.mongodb.net:27017,ac-uqql9vi-shard-00-02.wrxrpup.mongodb.net:27017/sevensyntax?replicaSet=atlas-vmcs2r-shard-0&ssl=true&authSource=admin';

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Define a Mongoose schema for users
const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
});
const channelSchema = new mongoose.Schema({
    userIds: {
        type: [String],
        required: true,
    },
});
const messageSchema = new mongoose.Schema({
    channelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Channel',
        required: true,
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

const Message = mongoose.model('Message', messageSchema);
const Channel = mongoose.model('Channel', channelSchema);
const User = mongoose.model('User', userSchema);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handler to join a room
    socket.on('joinRoom', (room) => {
        socket.join(room);
        console.log(`User ${socket.id} joined room ${room}`);
    });

    socket.on('sendMessage', (message) => {
        console.log(message);
        // Emit the message only to users in the specified room
        io.to(message.channelId).emit('receiveMessage', message);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected', socket.id);
    });
});

// Signup endpoint
app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Create a new user using the User model
        const newUser = new User({ username, email, password });

        // Save the new user to the database
        await newUser.save();

        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        // Check for duplicate key error (email already exists)
        if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Find the user by email in the database
        const user = await User.findOne({ email });

        if (!user || user.password !== password) {
            // Invalid credentials
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Successful login
        res.status(200).json({ message: 'Login successful', user });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'An error occurred during login' });
    }
});

// Define your fetchUsers endpoint
app.get('/fetchUsers', async (req, res) => {
    try {
        const users = await User.find({}, { password: 0 });
        res.status(200).json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Create or get an existing channel between two users
app.post('/channels', async (req, res) => {
    const { user1Id, user2Id } = req.body;

    try {
        // Check if the channel already exists between the two users
        let existingChannel = await Channel.findOne({ userIds: { $all: [user1Id, user2Id] } });
        if (!existingChannel) {
            // Create a new channel if it doesn't exist
            const newChannel = new Channel({
                userIds: [user1Id, user2Id],
            });
            existingChannel = await newChannel.save();
        }

        res.status(200).json({ message: 'Channel created or retrieved successfully', channel: existingChannel });
    } catch (error) {
        console.error('Error creating or retrieving channel:', error);
        res.status(500).json({ error: 'Failed to create or retrieve channel' });
    }
});

// Send a message in a channel
app.post('/sendMessage', async (req, res) => {
    const { channelId, senderId, message } = req.body;

    try {
        const newMessage = new Message({
            channelId,
            senderId,
            message,
        });
        const savedMessage = await newMessage.save();

        res.status(201).json({ message: 'Message sent successfully', savedMessage });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Fetch all messages for a channel
app.get('/messages/:channelId', async (req, res) => {
    const { channelId } = req.params;

    try {
        const messages = await Message.find({ channelId }).sort({ timestamp: 1 });
        res.status(200).json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Delete a message by ID
app.delete('/messages/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await Message.deleteOne({ _id: id });
        res.status(200).json({ message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});


server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
