/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { toCamelCase } from './aem.js';

/**
 * Gets placeholders object.
 * @param {string} [prefix] Location of placeholders
 * @returns {object} Window placeholders object
 */
// eslint-disable-next-line import/prefer-default-export
export async function fetchPlaceholders(prefix = 'default') {
  window.placeholders = window.placeholders || {};
  if (!window.placeholders[prefix]) {
    window.placeholders[prefix] = new Promise((resolve) => {
      fetch(`${prefix === 'default' ? '' : prefix}/placeholders.json`)
        .then((resp) => {
          if (resp.ok) {
            return resp.json();
          }
          return {};
        }).then((json) => {
          const placeholders = {};
          json.data
            .filter((placeholder) => placeholder.Key)
            .forEach((placeholder) => {
              placeholders[toCamelCase(placeholder.Key)] = placeholder.Text;
            });
          window.placeholders[prefix] = placeholders;
          resolve(window.placeholders[prefix]);
        }).catch(() => {
          // error loading placeholders
          window.placeholders[prefix] = {};
          resolve(window.placeholders[prefix]);
        });
    });
  }
  return window.placeholders[`${prefix}`];
}

/**
 * Replaces {{placeholders}} inside text nodes within a DOM subtree.
 *
 * Supports dot-notation paths (e.g. {{PDP.Product.AddToCart}}).
 * Resolution is performed against placeholders[prefix].
 *
 * Only text nodes are processed (HTML structure is preserved).
 *
 * @param {object} placeholders
 *   Root placeholders object (e.g. window.placeholders).
 *
 * @param {string} [prefix='default']
 *   Namespace key used to resolve placeholders (e.g. 'default', 'fr', etc.).
 *
 * @param {HTMLElement} [el=document.documentElement]
 *   Root element to search within.
 *
 * @returns {number}
 *   The number of placeholder replacements performed.
 */
export function applyPlaceholders(
  placeholders = {},
  prefix = 'default',
  el = document.documentElement
) {
  if (!el || !placeholders) return 0;

  const source = placeholders[prefix] || {};
  let count = 0;

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const pattern = /\{\{\s*([^}]+?)\s*\}\}/g;

  const resolvePath = (obj, path) =>
    path.split('.').reduce(
      (acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined),
      obj
    );

  for (let node; (node = walker.nextNode()); ) {
    const { textContent } = node;
    if (!textContent) continue;

    node.textContent = textContent.replace(pattern, (match, key) => {
      const value = resolvePath(source, key);

      if (typeof value === 'string') {
        count++;
        return value;
      }

      return match;
    });
  }

  return count;
}
