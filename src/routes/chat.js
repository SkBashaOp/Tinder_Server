const express = require("express");
const { userAuth } = require("../middlewares/userAuth");
const { Chat } = require("../models/chat");
const Message = require("../models/message");

const chatRouter = express.Router();

chatRouter.get("/chat/:targetUserId", userAuth, async (req, res) => {
    const { targetUserId } = req.params;
    const userId = req.user._id;

    try {
        let chat = await Chat.findOne({
            participants: { $all: [userId, targetUserId], $size: 2 },
        });

        if (!chat) {
            chat = await Chat.create({
                participants: [userId, targetUserId],
            });
        }

        const messages = await Message.find({ chatId: chat._id })
            .populate("senderId", "firstName lastName photoUrl")
            .sort({ createdAt: 1 });

        res.json({
            chatId: chat._id,
            messages,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to load chat" });
    }
});

module.exports = chatRouter;