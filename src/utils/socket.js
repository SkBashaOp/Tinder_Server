const socket = require("socket.io");
const crypto = require("crypto");
const { Chat } = require("../models/chat");
const Message = require("../models/message");
const User = require("../models/user");
const admin = require("./firebaseAdmin");

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

    const onlineUsers = new Map();

    io.on("connection", (socket) => {
        socket.on("joinChat", ({ firstName, userId, targetUserId }) => {
            const roomId = getSecretRoomId(userId, targetUserId);
            console.log(firstName + " joined Room : " + roomId);
            socket.join(roomId);

            onlineUsers.set(userId, socket.id);
            io.emit("onlineUsers", Array.from(onlineUsers.keys()));
        });

        socket.on(
            "sendMessage",
            async ({ firstName, lastName, photoUrl, userId, targetUserId, text }) => {
                try {
                    const roomId = getSecretRoomId(userId, targetUserId);

                    let chat = await Chat.findOne({
                        participants: { $all: [userId, targetUserId], $size: 2 },
                    });

                    // If no chat exists yet, create one
                    if (!chat) {
                        chat = await Chat.create({
                            participants: [userId, targetUserId],
                        });
                    }

                    // Save the message in the new Message collection
                    await Message.create({
                        chatId: chat._id,
                        senderId: userId,
                        text,
                    });

                    io.to(roomId).emit("messageReceived", { firstName, lastName, photoUrl, text, senderId: userId });

                    // Send Push Notification via Firebase
                    try {
                        const receiver = await User.findById(targetUserId);
                        if (receiver && receiver.fcmToken && admin) {
                            console.log("Sending push notification to target:", targetUserId, "Token:", receiver.fcmToken);
                            await admin.messaging().send({
                                token: receiver.fcmToken,
                                notification: {
                                    title: `New message from ${firstName}`,
                                    body: text
                                }
                            });
                            console.log("✅ Push notification sent successfully to Firebase!");
                        } else {
                            console.log("⚠️ Could not send push notification: Receiver, fcmToken, or admin missing.");
                        }
                    } catch (pushErr) {
                        console.error("❌ Push notification failed:", pushErr);
                    }
                } catch (err) {
                    console.error("Socket save error:", err);
                }
            }
        );

        socket.on("typing", ({ userId, targetUserId, firstName }) => {
            const roomId = getSecretRoomId(userId, targetUserId);
            socket.to(roomId).emit("userTyping", { firstName });
        });

        socket.on("messagesSeen", async ({ userId, targetUserId }) => {
            try {
                const roomId = getSecretRoomId(userId, targetUserId);
                let chat = await Chat.findOne({
                    participants: { $all: [userId, targetUserId], $size: 2 },
                });
                if (chat) {
                    await Message.updateMany(
                        { chatId: chat._id, senderId: targetUserId, seen: false },
                        { $set: { seen: true } }
                    );
                    io.to(roomId).emit("messagesMarkedAsSeen", { seenByUserId: userId });
                }
            } catch (err) {
                console.error("Socket seen error:", err);
            }
        });

        socket.on("disconnect", () => {
            let disconnectedUserId = null;
            for (let [uid, sid] of onlineUsers.entries()) {
                if (sid === socket.id) {
                    disconnectedUserId = uid;
                    onlineUsers.delete(uid);
                    break;
                }
            }
            if (disconnectedUserId) {
                io.emit("onlineUsers", Array.from(onlineUsers.keys()));
            }
        });
    });
};

module.exports = initializeSocket;