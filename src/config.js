const path = require('path');
require('dotenv').config();

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || './data/tafsirs');
const PORT = parseInt(process.env.PORT || '4001', 10);
const HOST = process.env.HOST || '0.0.0.0';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const RELOAD_TOKEN = process.env.RELOAD_TOKEN || null;

module.exports = { DATA_DIR, PORT, HOST, CORS_ORIGIN, CACHE_DIR, RELOAD_TOKEN };
