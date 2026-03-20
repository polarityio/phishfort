'use strict';

const createRequestWithDefaults = require('./src/createRequestWithDefaults');
const { validateStringOptions } = require('./src/validateOptions');
const {
  parseErrorToReadableJSON,
  transformIncident,
  buildSummary,
  buildNoIncidentDetails,
  getIncidentType
} = require('./src/dataTransformations');
const { getLookupResults } = require('./src/getLookupResults');

const PHISHFORT_BASE_URL = 'https://capi.phishfort.com';

let Logger;
let requestWithDefaults;

// In-memory cache: entityValue → { timestamp, data }
const LOOKUP_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const startup = async (logger) => {
  Logger = logger;
  requestWithDefaults = createRequestWithDefaults(Logger);
};

const _getCached = (key) => {
  const entry = LOOKUP_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    LOOKUP_CACHE.delete(key);
    return null;
  }
  return entry.data;
};

const _setCache = (key, data) => {
  LOOKUP_CACHE.set(key, { timestamp: Date.now(), data });
};

const _invalidateCache = (entityValue) => {
  LOOKUP_CACHE.delete(entityValue);
};

const doLookup = async (entities, options, cb) => {
  Logger.debug({ entities }, 'PhishFort doLookup');

  // Separate entities into cached and uncached
  const cachedResults = [];
  const uncachedEntities = [];

  for (const entity of entities) {
    const cached = _getCached(entity.value);
    if (cached) {
      Logger.trace({ entity: entity.value }, 'PhishFort cache hit');
      cachedResults.push({ entity, data: cached });
    } else {
      uncachedEntities.push(entity);
    }
  }

  if (uncachedEntities.length === 0) {
    return cb(null, cachedResults);
  }

  let freshResults = [];
  try {
    freshResults = await getLookupResults(uncachedEntities, options, requestWithDefaults, Logger);
  } catch (error) {
    const err = parseErrorToReadableJSON(error);
    Logger.error({ error, formattedError: err }, 'PhishFort doLookup failed');
    const detail =
      error.status === 401
        ? 'PhishFort authentication failed — check your API key.'
        : error.description || error.message || 'PhishFort lookup failed';
    return cb({ detail, err });
  }

  // Store fresh results in cache
  for (const result of freshResults) {
    if (result.data !== null) {
      _setCache(result.entity.value, result.data);
    }
  }

  Logger.trace({ freshResults }, 'PhishFort lookup results');
  cb(null, [...cachedResults, ...freshResults]);
};

/**
 * Re-fetches an entity by subject (after a write action) and returns updated details.
 * Falls back to no-incident object if 404.
 */
const _refreshEntity = async (entityValue, entityType, options) => {
  const subject = encodeURIComponent(entityValue);
  let result;
  try {
    result = await requestWithDefaults({
      method: 'GET',
      uri: `/v1/incident/subject/${subject}`,
      options
    });
  } catch (error) {
    throw error;
  }

  if (result.data === null || result.statusCode === 404) {
    const details = buildNoIncidentDetails();
    details.entityValue = entityValue;
    details.incidentType = entityType;
    return { summary: ['No PhishFort Incident'], details };
  }

  const transformed = transformIncident(result.body);
  transformed.entityValue = entityValue;
  transformed.incidentType = entityType;
  return { summary: buildSummary(transformed), details: transformed };
};

/**
 * Builds the correct POST body for new incident creation based on entity type.
 *
 * PhishFort API rule: the 'subject' field only accepts incidentType values of
 * 'ipv4', 'email', or 'phone'. Domain and URL entities must use the 'url' field
 * instead — sending incidentType: 'domain' will result in a 400 error.
 *
 * @param {string} entityValue
 * @param {string} incidentType - from getIncidentType(): 'ipv4'|'email'|'domain'|'url'
 * @returns {Object} body ready for POST
 */
const _buildNewIncidentBody = (entityValue, incidentType) => {
  if (incidentType === 'ipv4' || incidentType === 'email' || incidentType === 'phone') {
    return { subject: entityValue, incidentType };
  }
  // domain and url entities: use 'url' field — 'subject' only accepts ipv4/email/phone
  return { url: entityValue };
};

const onMessage = async (payload, options, cb) => {
  const { action, entityValue, entityType, incidentId, incidentType, comment } = payload;
  Logger.info({ action, entityValue, incidentId }, 'PhishFort onMessage');

  try {
    switch (action) {
      case 'SUBMIT_TAKEDOWN': {
        if (incidentId) {
          // Existing incident — request takedown on existing
          await requestWithDefaults({
            method: 'POST',
            uri: `/v1/incident/${encodeURIComponent(incidentId)}/tkd`,
            options
          });
          // If an optional comment was included, post it too
          if (comment && String(comment).trim().length > 0) {
            await requestWithDefaults({
              method: 'POST',
              uri: `/v1/incident/${encodeURIComponent(incidentId)}/comment`,
              body: { comment: String(comment).trim() },
              options
            });
          }
        } else {
          // New incident — body shape depends on entity type.
          // 'subject' + 'incidentType' is only valid for: ipv4, email, phone.
          // Domain and URL entities must use the 'url' field (no incidentType).
          const body = _buildNewIncidentBody(entityValue, incidentType);
          if (comment && String(comment).trim().length > 0) {
            body.comment = String(comment).trim();
          }
          await requestWithDefaults({
            method: 'POST',
            uri: '/v1/incident/tkd',
            body,
            options
          });
        }
        _invalidateCache(entityValue);
        const updated = await _refreshEntity(entityValue, incidentType, options);
        _setCache(entityValue, updated);
        return cb(null, { success: true, updatedData: updated });
      }

      case 'SUBMIT_MONITOR': {
        if (incidentId) {
          await requestWithDefaults({
            method: 'POST',
            uri: `/v1/incident/${encodeURIComponent(incidentId)}/monitor`,
            options
          });
          // If an optional comment was included, post it too
          if (comment && String(comment).trim().length > 0) {
            await requestWithDefaults({
              method: 'POST',
              uri: `/v1/incident/${encodeURIComponent(incidentId)}/comment`,
              body: { comment: String(comment).trim() },
              options
            });
          }
        } else {
          // New incident — body shape depends on entity type.
          // 'subject' + 'incidentType' is only valid for: ipv4, email, phone.
          // Domain and URL entities must use the 'url' field (no incidentType).
          const body = _buildNewIncidentBody(entityValue, incidentType);
          if (comment && String(comment).trim().length > 0) {
            body.comment = String(comment).trim();
          }
          await requestWithDefaults({
            method: 'POST',
            uri: '/v1/incident/monitor',
            body,
            options
          });
        }
        _invalidateCache(entityValue);
        const updated = await _refreshEntity(entityValue, incidentType, options);
        _setCache(entityValue, updated);
        return cb(null, { success: true, updatedData: updated });
      }

      case 'MARK_SAFE': {
        if (!incidentId) {
          return cb({ detail: 'Cannot mark safe: no existing PhishFort incident.' });
        }
        await requestWithDefaults({
          method: 'POST',
          uri: `/v1/incident/${encodeURIComponent(incidentId)}/safe`,
          options
        });
        _invalidateCache(entityValue);
        const updated = await _refreshEntity(entityValue, incidentType, options);
        _setCache(entityValue, updated);
        return cb(null, { success: true, updatedData: updated });
      }

      case 'ADD_COMMENT': {
        if (!incidentId) {
          return cb({ detail: 'Cannot add comment: no existing PhishFort incident.' });
        }
        if (!comment || String(comment).trim().length === 0) {
          return cb({ detail: 'Comment must be a non-empty string.' });
        }
        await requestWithDefaults({
          method: 'POST',
          uri: `/v1/incident/${encodeURIComponent(incidentId)}/comment`,
          body: { comment: String(comment).trim() },
          options
        });
        // Refresh to pick up new history entry
        _invalidateCache(entityValue);
        const updated = await _refreshEntity(entityValue, incidentType, options);
        _setCache(entityValue, updated);
        return cb(null, { success: true, updatedData: updated });
      }

      default:
        return cb({ detail: `Unknown action: ${action}` });
    }
  } catch (error) {
    const err = parseErrorToReadableJSON(error);
    Logger.error({ error, formattedError: err, action }, 'PhishFort onMessage error');
    const detail =
      error.status === 401
        ? 'PhishFort authentication failed — check your API key.'
        : error.description || error.message || `PhishFort action "${action}" failed`;
    return cb({ detail, err });
  }
};

const validateOptions = async (options, callback) => {
  const errors = validateStringOptions(
    { apiKey: 'You must provide a valid PhishFort API Key.' },
    options
  );
  callback(null, errors);
};

module.exports = { startup, doLookup, onMessage, validateOptions };
