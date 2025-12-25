#!/usr/bin/env node
import { createRequire } from 'module';
import updateNotifier from 'update-notifier';
import { startServer } from './index';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

// Check for updates
updateNotifier({ 
    pkg,
    updateCheckInterval: 1000 * 60 * 60 * 24 // 1 day
}).notify();

// Simple argument parsing could go here, e.g. --port
const args = process.argv.slice(2);
let port = 3001;
const portArg = args.find(a => a.startsWith('--port='));
if (portArg) {
    port = parseInt(portArg.split('=')[1], 10);
}

console.log("Starting Ghost Viewer CLI...");
startServer({ port, openBrowser: true, isDev: false });
