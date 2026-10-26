// Used only after the explicit build command; keeps minification in one process.
const config = require('../webpack.prod');
const TerserPlugin = require('terser-webpack-plugin');
config.parallelism = 1;
config.optimization.minimizer = [new TerserPlugin({ parallel: false })];
module.exports = config;
