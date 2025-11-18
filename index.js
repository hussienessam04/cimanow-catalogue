const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const { fetchCimaNow, parseMoviesPage, parseSeriesPage, parseMetaPage, parseStreamPage } = require('./scraper');
const NodeCache = require('node-cache');
const config = require('./config');
const express = require('express');

const cache = new NodeCache({ 
  stdTTL: 3600,
  checkperiod: 600
});

const manifest = {
  id: 'community.cimanow.arabic',
  version: '1.0.2',
  name: 'CimaNow Arabic',
  description: 'Arabic movies and series from CimaNow.cc',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'cimanow-movies',
      name: 'CimaNow - أفلام عربية',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'cimanow-series',
      name: 'CimaNow - مسلسلات عربية',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'cimanow-turkish',
      name: 'CimaNow - مسلسلات تركية',
      extra: [{ name: 'skip', isRequired: false }]
    }
  ],
  idPrefixes: ['cimanow_']
};

const builder = new addonBuilder(manifest);

// Catalog Handler
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  console.log(`[CATALOG] Type: ${type}, ID: ${id}, Skip: ${extra.skip || 0}`);

  const cacheKey = `catalog_${type}_${id}_${extra.skip || 0}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    console.log(`[CATALOG] Cached (${cached.length} items)`);
    return { metas: cached };
  }

  try {
    let url = '';
    switch(id) {
      case 'cimanow-movies':
        url = config.MOVIES_URL;
        break;
      case 'cimanow-series':
        url = config.SERIES_URL;
        break;
      case 'cimanow-turkish':
        url = config.TURKISH_SERIES_URL;
        break;
      default:
        url = config.BASE_URL;
    }

    const page = Math.floor((extra.skip || 0) / 20) + 1;
    if (page > 1) url += `page/${page}/`;

    console.log(`[CATALOG] Fetching: ${url}`);
    const html = await fetchCimaNow(url);
    const metas = type === 'movie' ? parseMoviesPage(html) : parseSeriesPage(html);
    console.log(`[CATALOG] Found ${metas.length} items`);

    if (metas.length > 0) {
      cache.set(cacheKey, metas, 1800);
      console.log(`[CACHE] Catalog cached for 30 minutes`);
    }

    return { metas };
  } catch (error) {
    console.error('[CATALOG] Error:', error.message);
    return { metas: [] };
  }
});

// Meta Handler
builder.defineMetaHandler(async ({ type, id }) => {
  console.log(`[META] ${id}`);
  const cacheKey = `meta_${id}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    console.log(`[CACHE] Returning cached meta`);
    return { meta: cached };
  }

  try {
    const urlPart = id.replace('cimanow_movie_', '').replace('cimanow_series_', '');
    const url = `${config.BASE_URL}${decodeURIComponent(urlPart)}`;
    console.log(`[META] Fetching: ${url}`);

    const html = await fetchCimaNow(url);
    const meta = await parseMetaPage(html, id, type);

    const currentYear = new Date().getFullYear();
    const seriesYear = parseInt(meta.year) || 0;
    const isRecent = (currentYear - seriesYear) <= 1;
    const cacheTTL = isRecent ? 300 : 21600;

    cache.set(cacheKey, meta, cacheTTL);

    const cacheMinutes = Math.floor(cacheTTL / 60);
    const cacheHours = Math.floor(cacheTTL / 3600);
    const cacheLabel = cacheTTL >= 3600 ? `${cacheHours}h` : `${cacheMinutes}min`;

    console.log(`[CACHE] ✅ ${meta.name}`);
    console.log(`[CACHE] Year: ${meta.year} | Status: ${isRecent ? '🆕 RECENT' : '📦 OLD'} | TTL: ${cacheLabel}`);

    return { meta };
  } catch (error) {
    console.error('[META] Error:', error.message);
    return { meta: null };
  }
});

// Stream Handler
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[STREAM] ${id}`);

  const cacheKey = `stream_${id}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    console.log(`[CACHE] Returning cached streams`);
    return { streams: cached };
  }

  try {
    const parts = id.split(':');
    const baseId = parts[0].replace('cimanow_movie_', '').replace('cimanow_series_', '');
    const url = `${config.BASE_URL}${decodeURIComponent(baseId)}`;

    console.log(`[STREAM] Fetching: ${url}`);
    const html = await fetchCimaNow(url);
    const streams = parseStreamPage(html);

    cache.set(cacheKey, streams, 3600);
    console.log(`[STREAM] Found ${streams.length} streams (cached for 1h)`);

    return { streams };
  } catch (error) {
    console.error('[STREAM] Error:', error.message);
    return { streams: [] };
  }
});

// Create Express app with CORS
const app = express();

// CORS middleware for web/mobile support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Mount Stremio addon
const addonInterface = builder.getInterface();
app.use(getRouter(addonInterface));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    cache_keys: cache.keys().length,
    uptime: process.uptime()
  });
});

// Start server
const port = process.env.PORT || 7000;
app.listen(port, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║        🎬 CimaNow Stremio Addon v1.0.2        ║
╚════════════════════════════════════════════════╝

📺 Install: http://localhost:${port}/manifest.json

🌐 CORS: Enabled (Web & Mobile support)

🎯 Smart Cache System:
   • Recent series (2024-2025): 5 minutes
   • Old series (before 2024): 6 hours  
   • Catalog pages: 30 minutes
   • Streams: 1 hour

📊 Cache Stats:
   • Total entries: ${cache.keys().length}

⏸️  Press Ctrl+C to stop
`);
});

// Cache stats logging
setInterval(() => {
  const stats = cache.getStats();
  console.log(`\n[CACHE STATS] Keys: ${stats.keys} | Hits: ${stats.hits} | Misses: ${stats.misses}`);
}, 300000);
