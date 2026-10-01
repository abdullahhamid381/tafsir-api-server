const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { PORT, HOST, CORS_ORIGIN, DATA_DIR, RELOAD_TOKEN } = require('./config');
const store = require('./utils/dataStore');
const editionsRouter = require('./routes/editions');
const searchRouter = require('./routes/search');

let lastLoadResult = null;

async function loadData() {
  console.log(`Loading tafsir data registry from: ${DATA_DIR}`);
  const result = await store.loadRegistry();
  lastLoadResult = result;
  if (result.editions === 0) {
    console.warn(`WARNING: ${result.warning}`);
  } else {
    console.log(`Loaded ${result.editions} edition(s).`);
  }
  return result;
}

async function main() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',') }));
  app.use(morgan('tiny'));
  app.use(express.json());

  // Never throws (see dataStore.loadRegistry) - a missing/empty data folder
  // just means 0 editions, not a crashed process.
  await loadData();

  app.get('/', (req, res) => {
    res.json({
      name: 'Tafsir API Server',
      status: store.isReady() ? 'ready' : 'waiting_for_data',
      docs: '/api/health',
    });
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: store.isReady() ? 'ok' : 'no_data',
      dataDir: DATA_DIR,
      editions: lastLoadResult ? lastLoadResult.editions : 0,
      warning: lastLoadResult && lastLoadResult.warning ? lastLoadResult.warning : undefined,
    });
  });

  // Re-scans DATA_DIR without restarting - useful after uploading more
  // editions/authors/languages later. Optionally protected by RELOAD_TOKEN.
  app.post('/api/reload', async (req, res, next) => {
    try {
      if (RELOAD_TOKEN && req.query.token !== RELOAD_TOKEN) {
        return res.status(401).json({ error: 'Invalid or missing reload token' });
      }
      const result = await loadData();
      res.json({ reloaded: true, editions: result.editions, warning: result.warning });
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', (req, res, next) => {
    if (!store.isReady()) {
      return res.status(503).json({
        error: 'No tafsir data loaded yet',
        dataDir: DATA_DIR,
        hint:
          'Upload/extract tafsir edition folders into DATA_DIR, then call ' +
          'POST /api/reload (or redeploy) to pick them up.',
      });
    }
    next();
  });

  app.use('/api', editionsRouter);
  app.use('/api', searchRouter);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  });

  app.listen(PORT, HOST, () => {
    console.log(`Tafsir API server listening on http://${HOST}:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
