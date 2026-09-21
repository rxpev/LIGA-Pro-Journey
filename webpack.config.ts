/**
 * Webpack configuration for Electron's
 * main and renderer processes.
 *
 * @module
 */
import 'dotenv/config';
import type { Configuration } from 'webpack';
import path from 'path';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import { EnvironmentPlugin } from 'webpack';

const runtimeDatabaseWatchIgnore = /[\\/]src[\\/]backend[\\/]prisma[\\/]saves(?:[\\/]|$)/;
const includeDevtools = process.env.LPJ_BUILD_FLAVOR === 'internal';
const devtoolsRoot = includeDevtools
  ? path.resolve(__dirname, process.env.LPJ_DEVTOOLS_PATH || '../LPJ-DEVTOOLS/src')
  : path.resolve(__dirname, 'src/devtools-disabled');

/**
 * Webpack shared configuration.
 *
 * @constant
 */
const WebpackSharedConfig = {
  plugins: [new ForkTsCheckerWebpackPlugin({ logger: 'webpack-infrastructure' })],
  watchOptions: {
    ignored: runtimeDatabaseWatchIgnore,
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
    alias: {
      '@liga/devtools/backend$': path.join(devtoolsRoot, 'backend.ts'),
      '@liga/devtools/preload$': path.join(devtoolsRoot, 'preload.ts'),
      '@liga/devtools/frontend$': path.join(devtoolsRoot, 'frontend.tsx'),
      // DevTools is developed in an adjacent private repository with its own
      // preview dependencies. Force the embedded build to share LPJ's React
      // singleton; two React instances break hooks at runtime.
      'react$': path.resolve(__dirname, 'node_modules/react'),
      'react-dom$': path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime$': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime$': path.resolve(
        __dirname,
        'node_modules/react/jsx-dev-runtime.js',
      ),
      '@liga': path.resolve(__dirname, 'src'),
      'package.json': path.resolve(__dirname, 'package.json'),
    },
  },
  module: {
    rules: [
      {
        test: /native_modules\/.+\.node$/,
        use: 'node-loader',
      },
      {
        test: /\.(m?js|node)$/,
        exclude: /\.prisma/,
        parser: { amd: false },
        use: {
          loader: '@vercel/webpack-asset-relocator-loader',
          options: {
            outputAssetBase: 'native_modules',
          },
        },
      },
      {
        test: /\.tsx?$/,
        exclude: /(node_modules|\.webpack)/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
      },
    ],
  },
};

/**
 * Webpack configuration options for
 * the main Electron process.
 *
 * @constant
 */
export const ElectronMainWebpackConfig: Configuration = {
  ...WebpackSharedConfig,
  entry: './src/backend/index.ts',
  plugins: [
    ...WebpackSharedConfig.plugins,
    new EnvironmentPlugin([
      'GH_ISSUES_CLIENT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_KEY_ID',
      'FIREBASE_PROJECT_ID',
    ]),
    new CopyPlugin({
      patterns: [{ from: './node_modules/.prisma/client' }],
    }),
  ],
};

/**
 * Webpack configuration options for
 * the renderer Electron process.
 *
 * @constant
 */
export const ElectronRendererWebpackConfig: Configuration = {
  ...WebpackSharedConfig,
  module: {
    rules: [
      ...WebpackSharedConfig.module.rules,
      {
        test: /\.css$/,
        use: [
          { loader: 'style-loader' },
          { loader: 'css-loader' },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: ['@tailwindcss/postcss'],
              },
            },
          },
        ],
      },
      {
        test: /(\.mp4|\.webm)$/,
        type: 'asset/resource',
      },
      {
        test: /\.(woff2?|ttf|otf)$/,
        type: 'asset/resource',
      },
      {
        test: /(\.png|\.svg)$/,
        type: 'asset/inline',
      },
    ],
  },
};
