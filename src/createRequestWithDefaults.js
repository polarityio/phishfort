'use strict';

const fs = require('fs');
const request = require('postman-request');
const config = require('../config/config.js');

const PHISHFORT_BASE_URL = 'https://capi.phishfort.com';

/**
 * Builds a request function with TLS/proxy defaults applied once at startup.
 * Auth is injected per-request via the x-api-key header using options.apiKey.
 *
 * Retry logic handles 429 (rate limit) with exponential backoff up to 3 attempts.
 *
 * @param {Object} Logger - Polarity logger
 * @returns {Function} requestWithDefaults(requestOptions) → Promise<{body, statusCode}>
 */
const createRequestWithDefaults = (Logger) => {
  const defaults = {};

  if (typeof config.request.cert === 'string' && config.request.cert.length > 0) {
    defaults.cert = fs.readFileSync(config.request.cert);
  }
  if (typeof config.request.key === 'string' && config.request.key.length > 0) {
    defaults.key = fs.readFileSync(config.request.key);
  }
  if (typeof config.request.passphrase === 'string' && config.request.passphrase.length > 0) {
    defaults.passphrase = config.request.passphrase;
  }
  if (typeof config.request.ca === 'string' && config.request.ca.length > 0) {
    defaults.ca = fs.readFileSync(config.request.ca);
  }
  if (typeof config.request.proxy === 'string' && config.request.proxy.length > 0) {
    defaults.proxy = config.request.proxy;
  }
  if (typeof config.request.rejectUnauthorized === 'boolean') {
    defaults.rejectUnauthorized = config.request.rejectUnauthorized;
  }

  const baseRequest = request.defaults(defaults);

  const _doRequest = (requestOptions) =>
    new Promise((resolve, reject) => {
      baseRequest(requestOptions, (err, response, body) => {
        if (err) {
          return reject({
            status: 'network_error',
            description: err.message || 'Network request error',
            requestOptions: _sanitizeOptions(requestOptions),
            err
          });
        }
        resolve({ body, statusCode: response.statusCode, response });
      });
    });

  /**
   * Execute a request with retry on 429.
   * @param {Object} requestOptions
   * @param {number} attempt
   * @returns {Promise<{body, statusCode}>}
   */
  const requestWithDefaults = async (requestOptions, attempt = 0) => {
    // Inject auth header from options
    const options = requestOptions.options || {};
    const headers = requestOptions.headers || {};
    if (options.apiKey) {
      headers['x-api-key'] = options.apiKey;
    }

    const mergedOptions = {
      ...requestOptions,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...headers
      },
      baseUrl: PHISHFORT_BASE_URL,
      json: true
    };

    // Remove the helper `options` field before sending
    delete mergedOptions.options;

    Logger.trace({ mergedOptions: _sanitizeOptions(mergedOptions) }, 'PhishFort Request');

    const { body, statusCode } = await _doRequest(mergedOptions);

    Logger.trace({ statusCode, body }, 'PhishFort Response');

    if (statusCode === 404) {
      return { data: null, statusCode };
    }

    if (statusCode === 401) {
      throw {
        status: 401,
        description:
          'Authentication failed — verify your PhishFort API key in the integration options.',
        requestOptions: _sanitizeOptions(mergedOptions)
      };
    }

    if (statusCode === 429) {
      if (attempt >= 3) {
        throw {
          status: 429,
          description:
            'PhishFort rate limit exceeded. Please wait before retrying.',
          requestOptions: _sanitizeOptions(mergedOptions)
        };
      }
      const delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      Logger.warn({ attempt, delayMs }, 'PhishFort 429 — retrying with backoff');
      await _sleep(delayMs);
      return requestWithDefaults({ ...requestOptions }, attempt + 1);
    }

    if (statusCode < 200 || statusCode >= 300) {
      throw {
        status: statusCode,
        description: `Unexpected HTTP ${statusCode} from PhishFort API`,
        body,
        requestOptions: _sanitizeOptions(mergedOptions)
      };
    }

    return { body, statusCode };
  };

  return requestWithDefaults;
};

const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const _sanitizeOptions = (opts) => {
  if (!opts) return opts;
  const sanitized = { ...opts };
  if (sanitized.headers) {
    sanitized.headers = { ...sanitized.headers };
    if (sanitized.headers['x-api-key']) {
      sanitized.headers['x-api-key'] = 'REDACTED';
    }
  }
  return sanitized;
};

module.exports = createRequestWithDefaults;
