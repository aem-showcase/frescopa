/** ***********************************************************************
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 * Copyright 2024 Adobe
 * All Rights Reserved.
 *
 * NOTICE: All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.

 * Adobe permits you to use and modify this file solely in accordance with
 * the terms of the Adobe license agreement accompanying it.
 ************************************************************************ */
import { getSubmitBaseUrl } from '../constant.js';
/**
 * Prefixes the URL with the context path.
 * @param {string} url - The URL to externalize.
 * @returns {string} - The externalized URL.
 */
export function externalize(url) {
  const submitBaseUrl = getSubmitBaseUrl();
  if (submitBaseUrl) {
    return `${submitBaseUrl}${url}`;
  }
  return url;
}

/**
 * Validates if the given URL is correct.
 * @param {string} url - The URL to validate.
 * @returns {boolean} - True if the URL is valid, false otherwise.
 */
function validateURL(url) {
  try {
    const validatedUrl = new URL(url, window.location.href);
    return (validatedUrl.protocol === 'http:' || validatedUrl.protocol === 'https:');
  } catch (err) {
    return false;
  }
}

/**
 * Converts a JSON string to an object.
 * @param {string} str - The JSON string to convert to an object.
 * @returns {object} - The parsed JSON object. Returns an empty object if an exception occurs.
 * @memberof module:FormView~customFunctions
 */
function toObject(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return {};
  }
}

/**
 * Navigates to the specified URL.
 * @param {string} destinationURL - The URL to navigate to.
 * If not specified, a new blank window will be opened.
 * @param {string} destinationType - The type of destination.
 * Supports the following values: "_newwindow", "_blank", "_parent", "_self", "_top",
 * or the name of the window.
 * @returns {Window} - The newly opened window.
 */
function navigateTo(destinationURL, destinationType) {
  let param = null;
  const windowParam = window;
  let arg = null;
  switch (destinationType) {
    case '_newwindow':
      param = '_blank';
      arg = 'width=1000,height=800';
      break;
    default:
      break;
  }
  if (!param) {
    if (destinationType) {
      param = destinationType;
    } else {
      param = '_blank';
    }
  }
  if (validateURL(destinationURL)) {
    windowParam.open(destinationURL, param, arg);
  }
}

/**
 * Default error handler for the invoke service API.
 * @param {object} response - The response body of the invoke service API.
 * @param {object} headers - The response headers of the invoke service API.
 * @param {scope} globals - An object containing read-only form instance,
 * read-only target field instance and methods for form modifications.
 * @returns {void}
 */
function defaultErrorHandler(response, headers, globals) {
  if (response && response.validationErrors) {
    response.validationErrors?.forEach((violation) => {
      if (violation.details) {
        if (violation.fieldName) {
          globals.functions.markFieldAsInvalid(violation.fieldName, violation.details.join('\n'), { useQualifiedName: true });
        } else if (violation.dataRef) {
          globals.functions.markFieldAsInvalid(violation.dataRef, violation.details.join('\n'), { useDataRef: true });
        }
      }
    });
  }
}

export {
  validateURL,
  navigateTo,
  toObject,
  defaultErrorHandler,
};
