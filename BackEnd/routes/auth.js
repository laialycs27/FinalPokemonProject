// routes/auth.js
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const {
  loadUsers,
  saveUsers,
  addOnlineUser,
  removeOnlineUser,
  loadOnlineUsers,
} = require("../helpers/userStorage");

const router = express.Router();

// Register Route
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const users = loadUsers();

    const alreadyExists = users.some(
      (user) => user.username === username || user.email === email
    );
    if (alreadyExists) {
      return res.status(409).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
    };

    users.push(newUser);
    saveUsers(users);

    const { password: _, ...safeUser } = newUser;
    res
      .status(201)
      .json({ message: "User registered successfully", user: safeUser });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = loadUsers();
    const user = users.find((u) => u.email === email);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { password: _, ...safeUser } = user;

    // Mark user as online
    addOnlineUser({
      id: safeUser.id,
      username: safeUser.username,
      email: safeUser.email,
    });

    res.status(200).json({ message: "Login successful", user: safeUser });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/online", (req, res) => {
  try {
    const online = loadOnlineUsers();
    res.status(200).json({ online });
  } catch (e) {
    console.error("online list error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Logout: remove from online list
router.post("/logout", (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId is required" });
  removeOnlineUser(userId);
  res.status(200).json({ message: "Logged out" });
});

module.exports = router;
