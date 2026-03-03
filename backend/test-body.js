const express = require("express");
const app = express();
app.use(express.json());

app.post("/test", (req, res) => {
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  console.log("Raw body:", req.body);
  res.json({ received: req.body });
});

app.listen(3002, () => console.log("Test server on port 3002"));

setTimeout(() => {
  const http = require("http");
  const data = JSON.stringify({ username: "test", password: "123456" });

  const options = {
    hostname: 'localhost',
    port: 3002,
    path: '/test',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log("Response:", body);
      process.exit(0);
    });
  });

  req.write(data);
  req.end();
}, 500);
