const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  outputFileTracingRoot: path.join(__dirname, '..'),
  images: {
    unoptimized: true,
  },
  basePath: process.env.NODE_ENV === 'production' ? '/cricket-predictor' : '',
};

module.exports = nextConfig;
