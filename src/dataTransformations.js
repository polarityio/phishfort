'use strict';

const PHISHFORT_BASE_URL = 'https://capi.phishfort.com';

/**
 * Maps a Polarity entity type to the PhishFort incidentType string.
 * Live API also uses "social" for social-media URLs — kept for display but not submitted by Polarity.
 * @param {Object} entity
 * @returns {string}
 */
const getIncidentType = (entity) => {
  const { type, types = [] } = entity;
  if (type === 'IPv4' || types.includes('IPv4')) return 'ipv4';
  if (type === 'email' || types.includes('email')) return 'email';
  if (type === 'url' || types.includes('url')) return 'url';
  return 'domain';
};

/**
 * Formats an ISO timestamp to YYYY-MM-DD, or returns 'N/A'.
 * @param {string|null} ts
 * @returns {string}
 */
const formatDate = (ts) => {
  if (!ts) return 'N/A';
  try {
    return new Date(ts).toISOString().slice(0, 10);
  } catch (_) {
    return String(ts);
  }
};

/**
 * Maps a PhishFort status string to a CSS modifier class name (pf-status-<key>).
 */
const STATUS_CLASS_MAP = {
  pending_review: 'pf-status-pending',
  case_building: 'pf-status-pending',
  approval_required: 'pf-status-action',
  takedown_ready: 'pf-status-action',
  action_required: 'pf-status-action',
  takedown_in_progress: 'pf-status-progress',
  takedown_success: 'pf-status-success',
  takedown_attempt_failed: 'pf-status-failed',
  blocklisted: 'pf-status-blocklisted',
  pre_weaponised: 'pf-status-closed',
  closed: 'pf-status-closed'
};

const getStatusClass = (status) => STATUS_CLASS_MAP[status] || 'pf-status-closed';

/**
 * Maps a PhishFort status to a human-readable label.
 */
const STATUS_LABEL_MAP = {
  pending_review: 'Pending Review',
  case_building: 'Case Building',
  approval_required: 'Approval Required',
  takedown_ready: 'Takedown Ready',
  action_required: 'Action Required',
  takedown_in_progress: 'Takedown In Progress',
  takedown_success: 'Takedown Success',
  takedown_attempt_failed: 'Takedown Failed',
  blocklisted: 'Blocklisted',
  pre_weaponised: 'Pre-Weaponised',
  closed: 'Closed'
};

const getStatusLabel = (status) => STATUS_LABEL_MAP[status] || (status || 'Unknown');


/**
 * Derives a human-readable incidentState label from the live API's boolean-flag object.
 *
 * Live API returns incidentState as an object of boolean flags, e.g.:
 *   { unresponsive: true, noDNSRecord: true, warningBanner: false, responsive: false, ... }
 *
 * Confirmed live fields (from /v1/incident/{id}):
 *   unresponsive, noDNSRecord, domainRevoked, warningBanner, responsive,
 *   contentRemoved, redirect, inconclusive, timestamp, message, ssdeep, ssdeepSource
 *
 * @param {Object|null} stateObj
 * @returns {{ label: string, message: string|null, timestamp: string|null }}
 */
const parseIncidentState = (stateObj) => {
  if (!stateObj || typeof stateObj !== 'object' || Object.keys(stateObj).length === 0) {
    return { label: 'Unknown', message: null, timestamp: null };
  }

  // Priority-ordered flag → label mapping
  const flagOrder = [
    ['contentRemoved', 'Content Removed'],
    ['domainRevoked', 'Domain Revoked'],
    ['warningBanner', 'Warning Banner'],
    ['redirect', 'Redirect'],
    ['responsive', 'Responsive'],
    ['noDNSRecord', 'No DNS Record'],
    ['unresponsive', 'Unresponsive'],
    ['inconclusive', 'Inconclusive']
  ];

  for (const [flag, label] of flagOrder) {
    if (stateObj[flag] === true) {
      return {
        label,
        message: stateObj.message ?? null,
        timestamp: stateObj.timestamp ? formatDate(stateObj.timestamp) : null
      };
    }
  }

  return {
    label: 'Unknown',
    message: stateObj.message ?? null,
    timestamp: stateObj.timestamp ? formatDate(stateObj.timestamp) : null
  };
};

/**
 * Transforms a raw PhishFort incident API response into display-ready details.
 *
 * Field mapping validated against live /v1/incident/{id} API (March 2026):
 *
 * CONFIRMED live fields (present in live responses):
 *   id, subject, status, incidentState (object w/ boolean flags — NOT a string),
 *   incidentClass, incidentType, clientId, source, timestamp (= reported date),
 *   lastHistoryUpdateTimestamp, reportedBy, safeDomain, domain, url,
 *   threatTaxonomy.{name,description,incidentClass,incidentTargetType,incidentType,incidentThreatType},
 *   registrar.{name} (no difficulty field in live data), history[].{message,timestamp,type},
 *   attachments[], waitForClient
 *
 * ABSENT from live data (spec mentioned but not observed):
 *   reportedTimestamp (use `timestamp` instead), burnStartedTimestamp, takedownTimestamp,
 *   hostingProvider, registrar.difficulty
 *
 * @param {Object} raw - Raw API response body from .data
 * @returns {Object}
 */
const transformIncident = (raw) => {
  const taxonomy = raw.threatTaxonomy || {};
  const stateInfo = parseIncidentState(raw.incidentState);

  // `timestamp` is the creation/reported timestamp — `reportedTimestamp` does not exist in live data
  const reportedDate = formatDate(raw.timestamp ?? raw.reportedTimestamp);

  // burnStarted/takedown timestamps absent from live data; keep defensively
  const burnStartedDate = raw.burnStartedTimestamp ? formatDate(raw.burnStartedTimestamp) : null;
  const takedownDate = raw.takedownTimestamp ? formatDate(raw.takedownTimestamp) : null;

  return {
    incidentId: raw.id ?? null,
    subject: raw.subject ?? 'N/A',

    // Status
    status: raw.status ?? null,
    statusLabel: getStatusLabel(raw.status),
    statusClass: getStatusClass(raw.status),

    // incidentState — parsed from boolean flag object
    incidentStateLabel: stateInfo.label,
    incidentStateMessage: stateInfo.message,
    incidentStateTimestamp: stateInfo.timestamp,
    hasIncidentState: stateInfo.label !== 'Unknown',

    // Classification
    incidentClass: raw.incidentClass ?? 'N/A',
    incidentType: raw.incidentType ?? 'N/A',

    // Metadata
    clientId: raw.clientId ?? 'N/A',
    source: raw.source ?? 'N/A',
    reportedBy: raw.reportedBy ?? null,
    waitForClient: raw.waitForClient ?? null,

    // Undocumented but present in live data: the brand/safe domain being protected
    safeDomain: raw.safeDomain ?? null,

    // Registrar — confirmed only has `name` (no difficulty in live data)
    registrarName: raw.registrar?.name ?? (typeof raw.registrar === 'string' ? raw.registrar : null),

    // Hosting provider — not observed in live data; kept defensively
    hostingProvider: raw.hostingProvider?.name ?? (typeof raw.hostingProvider === 'string' ? raw.hostingProvider : null),

    // Timeline dates
    reportedDate,
    burnStartedDate,
    takedownDate,

    // Timeline step (1-4) — simplified since burnStarted/takedown absent in live data
    timelineStep: (() => {
      if (takedownDate) return 4;
      if (burnStartedDate) return 3;
      if (['case_building','approval_required','takedown_ready','action_required','takedown_in_progress'].includes(raw.status))
        return 2;
      return 1;
    })(),

    // Threat taxonomy — richer from detail endpoint
    taxonomyName: taxonomy.name ?? 'N/A',
    taxonomyCategory: taxonomy.description || null,
    taxonomyTargetType: taxonomy.incidentTargetType?.name ?? null,
    taxonomyThreatType: taxonomy.incidentThreatType?.name ?? null,

    // History — live field is `message` (NOT `description` or `event`)
    // type is "info" | "info/auto"
    history: Array.isArray(raw.history)
      ? raw.history.map((entry) => ({
          date: formatDate(entry.timestamp),
          event: entry.message ?? JSON.stringify(entry),
          type: entry.type ?? 'info'
        }))
      : [],
    hasHistory: Array.isArray(raw.history) && raw.history.length > 0,

    hasIncident: true
  };
};

/**
 * Builds the Polarity summary tag array from a transformed incident.
 * @param {Object} details
 * @returns {string[]}
 */
const buildSummary = (details) => {
  const tags = [];
  tags.push(details.statusLabel);
  if (details.incidentClass && details.incidentClass !== 'N/A') {
    tags.push(details.incidentClass);
  }
  if (details.taxonomyName && details.taxonomyName !== 'N/A') {
    const name = details.taxonomyName;
    tags.push(name.length > 25 ? name.slice(0, 24) + '…' : name);
  }
  return tags;
};

/**
 * Builds a no-incident details object for a 404 response.
 * @returns {Object}
 */
const buildNoIncidentDetails = () => ({
  hasIncident: false,
  noIncidentMsg: 'No PhishFort Incident Found'
});

/**
 * Serializes an error (including circular references) into a plain JSON-safe object.
 * @param {Error|Object} error
 * @returns {Object}
 */
const parseErrorToReadableJSON = (error) => {
  if (!(error instanceof Error) && typeof error === 'object') {
    return error;
  }
  return Object.getOwnPropertyNames(error).reduce((acc, key) => {
    try {
      acc[key] = error[key];
    } catch (_) {
      acc[key] = '<unparseable>';
    }
    return acc;
  }, {});
};

module.exports = {
  PHISHFORT_BASE_URL,
  getIncidentType,
  formatDate,
  getStatusClass,
  getStatusLabel,
  parseIncidentState,
  transformIncident,
  buildSummary,
  buildNoIncidentDetails,
  parseErrorToReadableJSON
};
