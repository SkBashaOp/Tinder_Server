const socket = require("socket.io");
const crypto = require("crypto");
const { Chat } = require("../models/chat");

const getSecretRoomId = (userId, targetUserId) => {
    return crypto
        .createHash("sha256")
        .update([userId, targetUserId].sort().join("$"))
        .digest("hex");
};

const initializeSocket = (server) => {
    const io = socket(server, {
        cors: {
            origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
            credentials: true,
        },
    });

    io.on("connection", (socket) => {
        socket.on("joinChat", ({ firstName, userId, targetUserId }) => {
            const roomId = getSecretRoomId(userId, targetUserId);
            console.log(firstName + " joined Room : " + roomId);
            socket.join(roomId);
        });

        socket.on(
            "sendMessage",
            async ({ firstName, lastName, userId, targetUserId, text }) => {
                try {
                    const roomId = getSecretRoomId(userId, targetUserId);

                    // Try to push the message into an existing chat
                    let chat = await Chat.findOneAndUpdate(
                        {
                            participants: { $all: [userId, targetUserId], $size: 2 },
                        },
                        { $push: { messages: { senderId: userId, text } } },
                        { new: true }
                    );

                    // If no chat exists yet, create one
                    if (!chat) {
                        chat = await Chat.create({
                            participants: [userId, targetUserId],
                            messages: [{ senderId: userId, text }],
                        });
                    }

                    io.to(roomId).emit("messageReceived", { firstName, lastName, text, senderId: userId });
                } catch (err) {
                    console.error("Socket save error:", err);
                }
            }
        );

        socket.on("disconnect", () => { });
    });
};

module.exports = initializeSocket;