require('dotenv').config();
const http = require('http');
const mysql = require('mysql2');
const url = require('url');
const messages = require('./lang/en/en');

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
};

// SET UP MYSQL CONNECTION POOL
const dbPool = mysql.createPool(dbConfig);

dbPool.getConnection((err, connection) => {
  if (err) {
    console.error(messages.error.dbConnectionError, err);
    return;
  }

  connection.query(`
    CREATE TABLE IF NOT EXISTS patient (
      patientid INT(11) NOT NULL AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      dateOfBirth DATETIME,
      PRIMARY KEY (patientid)
    ) ENGINE=InnoDB;
  `, (err) => {
    if (err) {
      console.error(messages.error.createTableError, err);
    } else {
      console.log(messages.success.tableReady);
    }
    connection.release(); // Release the connection back to the pool
  });
});


const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;

  if (path.startsWith('/lab5/api/v1/sql')) {
    if (req.method === "GET") {
      const parts = path.split('/lab5/api/v1/sql/');
      let queryText = parts.length > 1 ? decodeURIComponent(parts[1]) : "";
      processQuery(queryText, res);
    } else if (req.method === "POST") {
      let body = "";
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => { processQuery(body.toString(), res); });
    } else {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: messages.error.methodNotAllowed }));
    }
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: messages.error.notFound }));
  }
});

function processQuery(queryText, res) {
  if (!queryText) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: messages.error.noQuery }));
    return;
  }

  const lowerQuery = queryText.toLowerCase().trim();
  const disallowedKeywords = ["update", "delete", "drop", "alter"];

  for (const keyword of disallowedKeywords) {
    if (lowerQuery.includes(keyword)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: messages.error.operationNotAllowed }));
      return;
    }
  }

  // Check if the table exists before running queries
  dbPool.query("SHOW TABLES LIKE 'patient'", (err, results) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: messages.error.queryExecutionError, details: err.message }));
      return;
    }

    if (results.length === 0) {
      // Table does not exist, recreate it
      console.log("Table 'patient' missing. Recreating...");

      const createTableQuery = `
        CREATE TABLE patient (
          patientid INT(11) NOT NULL AUTO_INCREMENT,
          name VARCHAR(100) NOT NULL,
          dateOfBirth DATETIME,
          PRIMARY KEY (patientid)
        ) ENGINE=InnoDB;
      `;

      dbPool.query(createTableQuery, (err) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: messages.error.createTableError, details: err.message }));
          return;
        }
        console.log("Table 'patient' recreated successfully.");
        executeQuery(queryText, res);
      });
    } else {
      // Table exists, proceed with the query
      executeQuery(queryText, res);
    }
  });
}

function executeQuery(queryText, res) {
  if (queryText.toLowerCase().startsWith("select") || queryText.toLowerCase().startsWith("insert")) {
    dbPool.query(queryText, (err, results) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: messages.error.queryExecutionError, details: err.message }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
      }
    });
  } else {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: messages.error.onlySelectInsert }));
  }
}

const PORT = 8080;
server.listen(PORT, () => {
  console.log(`Server2 is running on port ${PORT}`);
});
