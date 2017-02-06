const _ = require('lodash');
const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const VersionFilePlugin = require('webpack-version-file-plugin');
const CrxPlugin = require('crx-webpack-plugin');

const config = require('./config.js');
const pkg = require('../package.json');

const appName = `${pkg.name}-${pkg.version}`;


module.exports = _.merge({}, config, {
  output: {
    path: path.resolve(__dirname, '../build/prod'),
  },

  // devtool: 'eval',
  plugins: [
    new CopyWebpackPlugin([
      { from: './src' }
    ], {
      ignore: ['js/**/*', 'manifest.json'],
      copyUnmodified: true
    }),
    new VersionFilePlugin({
      packageFile: path.resolve(__dirname, '../package.json'),
      template: path.resolve(__dirname, '../src/manifest.json'),
      outputFile: path.resolve(__dirname, '../build/prod/manifest.json'),
    }),
    new CrxPlugin({
      keyFile: '../mykey.pem',
      contentPath: '../build/prod',
      outputPath: '../build',
      name: appName
    }),
    new webpack.DefinePlugin({ 'process.env.NODE_ENV': '"production"' }),
    new webpack.optimize.UglifyJsPlugin({
      compressor: {
        screw_ie8: true,
        warnings: false
      },
      mangle: {
        screw_ie8: true
      },
      output: {
        comments: false,
        screw_ie8: true
      }
    }),
  ]
});
