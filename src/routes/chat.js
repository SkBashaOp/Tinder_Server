const express = require("express");
const { userAuth } = require("../middlewares/userAuth");
const { Chat } = require("../models/chat");

const chatRouter = express.Router();

chatRouter.get("/chat/:targetUserId", userAuth, async (req, res) => {
    const { targetUserId } = req.params;
    const userId = req.user._id;

    try {
        // Find existing chat or create a new one
        let chat = await Chat.findOne({
            participants: { $all: [userId, targetUserId], $size: 2 },
        }).populate({
            path: "messages.senderId",
            select: "firstName lastName",
        });

        if (!chat) {
            chat = await Chat.create({
                participants: [userId, targetUserId],
                messages: [],
            });
        }

        res.json(chat);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to load chat" });
    }
});

module.exports = chatRouter;