const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

console.log("🚀 STARTING MINIMAL SERVER");

app.use((req, res, next) => {
    console.log(`📥 [${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

app.get("/health", (req, res) => {
    console.log("🏥 Health check");
    res.json({ status: "ok" });
});

app.get("*", (req, res) => {
    console.log("🌍 Root hit!");
    res.send("<h1>Minimal Server Working!</h1>");
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Minimal server running on port ${PORT}`);
});
