const https = require("https");

https.get("https://cdns-images.dzcdn.net", (res) => {
  console.log("TLS OK, status:", res.statusCode);
}).on("error", (err) => {
  console.error("TLS ERROR:", err.message);
});