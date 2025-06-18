import express from "express";
import session from "express-session";
import chatRoutes from "./routes/chat";
import authRoutes from "./routes/auth";
import { initDatabase } from "./lib/database";

const app = express();
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret",
    resave: false,
    saveUninitialized: false,
  })
);
app.use("/api/chat", chatRoutes);
app.use("/api/auth", authRoutes);
app.use(express.static("dist"));
app.get("/", (req, res) => {
  res.send("🔧 ForgeBot backend is running.");
});
app.get("/.well-known/farcaster.json", (req, res) => {
  res.json({
    frame: {
      name: "ForgeBot",
      homeUrl: process.env.HOSTNAME,
      iconUrl: `${process.env.HOSTNAME}/icon.png`,
      requiredChains: ["eip155:8453"],
    },
  });
});

initDatabase();
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port 3000");
});
