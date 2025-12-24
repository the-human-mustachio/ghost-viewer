#!/usr/bin/env node
import { startServer } from './index';

// Simple argument parsing could go here, e.g. --port
const args = process.argv.slice(2);
let port = 3001;
const portArg = args.find(a => a.startsWith('--port='));
if (portArg) {
    port = parseInt(portArg.split('=')[1], 10);
}

console.log("Starting Ghost Viewer CLI...");
startServer({ port, openBrowser: true, isDev: false });
