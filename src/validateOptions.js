'use strict';

/**
 * Returns an array of error objects for string options that are empty.
 * @param {Object} errorMessages - key: option key, value: error message string
 * @param {Object} options - Polarity options object
 * @returns {Array} errors
 */
const validateStringOptions = (errorMessages, options) => {
  return Object.keys(errorMessages).reduce((errors, key) => {
    const value = options[key] && options[key].value;
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push({ key, message: errorMessages[key] });
    }
    return errors;
  }, []);
};

module.exports = { validateStringOptions };
