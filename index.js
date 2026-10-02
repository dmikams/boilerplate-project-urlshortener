require('dotenv').config();
const dns = require('dns');

// Override DNS settings to resolve MongoDB SRV lookups on local networks
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const app = express();

// Basic Configuration (Defines 'port')
const port = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI);

// Define Schema and Model for URLs
const urlSchema = new mongoose.Schema({
  original_url: { type: String, required: true },
  short_url: { type: Number, required: true }
});

const Url = mongoose.model('Url', urlSchema);

app.use(cors());

// Middleware for parsing POST request bodies
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use('/public', express.static(`${process.cwd()}/public`));

app.get('/', function(req, res) {
  res.sendFile(process.cwd() + '/views/index.html');
});

// Test API Endpoint
app.get('/api/hello', function(req, res) {
  res.json({ greeting: 'hello API' });
});

// 1. POST Endpoint: Handle short URL creation
app.post('/api/shorturl', (req, res) => {
  const originalUrl = req.body.url;

  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(originalUrl);
  } catch (err) {
    return res.json({ error: 'invalid url' });
  }

  // Ensure protocol is http or https
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.json({ error: 'invalid url' });
  }

  // Verify hostname using dns.lookup
  dns.lookup(parsedUrl.hostname, async (err, address) => {
    if (err || !address) {
      return res.json({ error: 'invalid url' });
    }

    try {
      // Check if URL already exists in database
      let existingUrl = await Url.findOne({ original_url: originalUrl });
      if (existingUrl) {
        return res.json({
          original_url: existingUrl.original_url,
          short_url: existingUrl.short_url
        });
      }

      // Generate incremental short_url ID
      const count = await Url.countDocuments({});
      const newUrl = new Url({
        original_url: originalUrl,
        short_url: count + 1
      });

      await newUrl.save();

      res.json({
        original_url: newUrl.original_url,
        short_url: newUrl.short_url
      });
    } catch (dbErr) {
      res.status(500).json({ error: 'Database error' });
    }
  });
});

// 2. GET Endpoint: Redirect short URL to target destination
app.get('/api/shorturl/:short_url', async (req, res) => {
  const shortUrlParam = parseInt(req.params.short_url, 10);

  if (isNaN(shortUrlParam)) {
    return res.json({ error: 'Wrong format' });
  }

  try {
    const foundUrl = await Url.findOne({ short_url: shortUrlParam });
    if (foundUrl) {
      return res.redirect(foundUrl.original_url);
    } else {
      return res.json({ error: 'No short URL found for the given input' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Start listening on port
app.listen(port, function() {
  console.log(`Listening on port ${port}`);
});