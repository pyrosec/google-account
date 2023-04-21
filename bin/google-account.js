#!/usr/bin/env node

const { PuppeteerCLI } = require('base-puppeteer/lib/base-cli');
const { createLogger } = require('base-puppeteer/lib/logger');
const path = require('path');

const logger = createLogger(require('../package').name);

const cli = new PuppeteerCLI({
  logger,
  programName: 'google-account',
  puppeteerClassPath: path.join(__dirname, '..', 'lib', 'google-account')
});

(async () => {
  await cli.runCLI();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

