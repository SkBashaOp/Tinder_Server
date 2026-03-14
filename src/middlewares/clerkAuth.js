const { verifyToken } = require("@clerk/backend");

module.exports.clerkAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    // payload.sub is the Clerk userId e.g. "user_2ab83jd92"
    req.clerkId = payload.sub;

    next();
  } catch (error) {
    console.error("Clerk token verification failed:", error.message);
    res.status(401).json({ message: "Unauthorized: Invalid Clerk token" });
  }
};
