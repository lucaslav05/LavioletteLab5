// server2.js
// ----------------------------------------
// REQUIRED MODULES
require('dotenv').config();
const http = require('http');
const mysql = require('mysql2');
const url = require('url');
const messages = require('./lang/en/en');

// ----------------------------------------
// CONFIGURATION STRINGS (do not use "var")
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

// ----------------------------------------
// SET UP MYSQL CONNECTION POOL
const dbPool = mysql.createPool({
  host: dbConfig.host,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database
});

// ----------------------------------------
// CREATE TABLE IF IT DOESN'T EXIST
// No need for explicit dbPool.connect() since we're using a pool.
dbPool.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``, (err) => {
  if (err) {
    console.error(messages.error.createDatabaseError, err);
    return;
  }
  console.log(messages.success.databaseReady);

  const createTableQuery = `
    DROP TABLE IF EXISTS patient;
    CREATE TABLE patient (
        patientid INT(11) NOT NULL AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        dateOfBirth DATETIME,
        PRIMARY KEY (patientid)
    ) ENGINE=InnoDB;
  `;

  dbPool.query(createTableQuery, (err) => {
    if (err) {
      console.error(messages.error.createTableError, err);
    } else {
      console.log(messages.success.tableReady);
    }
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
      let queryText = "";
      if (parts.length > 1) {
        queryText = decodeURIComponent(parts[1]);
      }
      processQuery(queryText, res);
    } else if (req.method === "POST") {
      let body = "";
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const queryText = body.toString();
        processQuery(queryText, res);
      });
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

  if (lowerQuery.startsWith("select") || lowerQuery.startsWith("insert")) {
    // Check if the table exists before running the query
    dbPool.query('SHOW TABLES LIKE "patient"', (err, results) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: messages.error.queryExecutionError, details: err.message }));
        return;
      }

      if (results.length === 0) {
        // If the table doesn't exist, create it
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
          } else {
            // Table created, now execute the original query
            dbPool.query(queryText, (err, results) => {
              if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: messages.error.queryExecutionError, details: err.message }));
              } else {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(results));
              }
            });
          }
        });
      } else {
        // If the table exists, proceed with the query
        dbPool.query(queryText, (err, results) => {
          if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: messages.error.queryExecutionError, details: err.message }));
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(results));
          }
        });
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
