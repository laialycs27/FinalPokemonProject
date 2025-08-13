const express = require("express");
const cors = require("cors");
const app = express();
const port = 3000;

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const infoRoutes = require("./routes/info");
const arenaRoutes = require("./routes/arena");

app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/info", infoRoutes);
app.use("/arena", arenaRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
