'use strict';

const {
  transformIncident,
  buildSummary,
  buildNoIncidentDetails,
  getIncidentType
} = require('./dataTransformations');

/**
 * Performs a per-entity PhishFort subject lookup.
 * Returns a Polarity lookup result object.
 *
 * @param {Object} entity
 * @param {Object} options
 * @param {Function} requestWithDefaults
 * @param {Object} Logger
 * @returns {Promise<Object>} Polarity lookup result
 */
const queryEntity = async (entity, options, requestWithDefaults, Logger) => {
  const subject = encodeURIComponent(entity.value);

  let result;
  try {
    result = await requestWithDefaults({
      method: 'GET',
      uri: `/v1/incident/subject/${subject}`,
      options
    });
  } catch (error) {
    // Surface 401 auth errors, re-throw all others
    if (error.status === 401) {
      throw error;
    }
    Logger.error({ error, entity: entity.value }, 'PhishFort queryEntity error');
    throw error;
  }

  // 404 — no existing incident for this entity
  if (result.data === null || result.statusCode === 404) {
    const details = buildNoIncidentDetails();
    details.entityValue = entity.value;
    details.incidentType = getIncidentType(entity);
    return {
      entity,
      data: {
        summary: ['No PhishFort Incident'],
        details
      }
    };
  }

  const transformed = transformIncident(result.body);
  transformed.entityValue = entity.value;
  transformed.incidentType = getIncidentType(entity);

  return {
    entity,
    data: {
      summary: buildSummary(transformed),
      details: transformed
    }
  };
};

/**
 * Runs all entity lookups concurrently (bounded by options.maxConcurrent).
 *
 * @param {Object[]} entities
 * @param {Object} options
 * @param {Function} requestWithDefaults
 * @param {Object} Logger
 * @returns {Promise<Object[]>}
 */
const getLookupResults = async (entities, options, requestWithDefaults, Logger) => {
  const maxConcurrent = Math.max(1, parseInt(options.maxConcurrent, 10) || 5);

  // Process entities in chunks to respect maxConcurrent
  const results = [];
  for (let i = 0; i < entities.length; i += maxConcurrent) {
    const chunk = entities.slice(i, i + maxConcurrent);
    const chunkResults = await Promise.all(
      chunk.map((entity) => queryEntity(entity, options, requestWithDefaults, Logger))
    );
    results.push(...chunkResults);
  }
  return results;
};

module.exports = { getLookupResults, queryEntity };
