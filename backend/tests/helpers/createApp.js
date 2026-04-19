const { createServer } = require("http");
const { app } = require("../../server");

let server;

function startServer() {
  if (!server) {
    server = createServer(app);
    server.listen(0);
  }
  return server;
}

async function stopServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
}

module.exports = { startServer, stopServer };
