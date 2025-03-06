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
import { submitSuccess, submitFailure } from '../submit.js';
import {
  createHelpText, createLabel, updateOrCreateInvalidMsg, getCheckboxGroupValue,
} from '../util.js';
import registerCustomFunctions from './functionRegistration.js';
import { externalize } from './functions.js';
import initializeRuleEngineWorker from './worker.js';
import { createOptimizedPicture } from '../../../scripts/aem.js';

const formModel = {};

function disableElement(el, value) {
  el.toggleAttribute('disabled', value === true);
  el.toggleAttribute('aria-readonly', value === true);
}

function compare(fieldVal, htmlVal, type) {
  if (type === 'number') {
    return fieldVal === Number(htmlVal);
  }
  if (type === 'boolean') {
    return fieldVal?.toString() === htmlVal;
  }
  return fieldVal === htmlVal;
}

function handleActiveChild(id, form) {
  form.querySelectorAll('[data-active="true"]').forEach((ele) => ele.removeAttribute('data-active'));
  const field = form.querySelector(`#${id}`);
  if (field) {
    field.closest('.field-wrapper').dataset.active = true;
    field.focus();
    // prevent scroll into view when user clicks on a field.
    if (document.activeElement !== field && !field.contains(document.activeElement)) {
      field.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

async function fieldChanged(payload, form, generateFormRendition) {
  const { changes, field: fieldModel } = payload;
  const {
    id, name, fieldType, readOnly, type, displayValue, displayFormat, displayValueExpression,
    activeChild,
  } = fieldModel;
  const field = form.querySelector(`#${id}`);
  if (!field) {
    return;
  }
  const fieldWrapper = field?.closest('.field-wrapper');
  changes.forEach((change) => {
    const { propertyName, currentValue, prevValue } = change;
    switch (propertyName) {
      case 'required':
        if (currentValue === true) {
          fieldWrapper.dataset.required = '';
        } else {
          fieldWrapper.removeAttribute('data-required');
        }
        break;
      case 'validationMessage':
        {
          const { validity } = payload.field;
          if (field.setCustomValidity
          && (validity?.expressionMismatch || validity?.customConstraint)) {
            field.setCustomValidity(currentValue);
            updateOrCreateInvalidMsg(field, currentValue);
          }
        }
        break;
      case 'value':
        if (['number', 'date', 'text', 'email'].includes(field.type) && (displayFormat || displayValueExpression)) {
          field.setAttribute('edit-value', currentValue);
          field.setAttribute('display-value', displayValue);
          if (document.activeElement !== field) {
            field.value = displayValue;
          }
        } else if (fieldType === 'radio-group' || fieldType === 'checkbox-group') {
          field.querySelectorAll(`input[name=${name}]`).forEach((el) => {
            const exists = (Array.isArray(currentValue)
              && currentValue.some((x) => compare(x, el.value, type.replace('[]', ''))))
              || compare(currentValue, el.value, type);
            el.checked = exists;
          });
        } else if (fieldType === 'checkbox') {
          field.checked = compare(currentValue, field.value, type);
        } else if (fieldType === 'plain-text') {
          field.innerHTML = currentValue;
        } else if (fieldType === 'image') {
          const altText = field?.querySelector('img')?.alt || '';
          field.querySelector('picture')?.replaceWith(createOptimizedPicture(field, currentValue, altText));
        } else if (field.type !== 'file') {
          field.value = currentValue;
        }
        break;
      case 'visible':
        fieldWrapper.dataset.visible = currentValue;
        if (fieldType === 'panel' && fieldWrapper.querySelector('dialog')) {
          const dialog = fieldWrapper.querySelector('dialog');
          if (currentValue === false && dialog.open) {
            dialog.close(); // close triggers the event listener that removes the dialog overlay
          }
        }
        break;
      case 'enabled':
        // If checkboxgroup/radiogroup/drop-down is readOnly then it should remain disabled.
        if (fieldType === 'radio-group' || fieldType === 'checkbox-group') {
          if (readOnly === false) {
            field.querySelectorAll(`input[name=${name}]`).forEach((el) => {
              disableElement(el, !currentValue);
            });
          }
        } else if (fieldType === 'drop-down') {
          if (readOnly === false) {
            disableElement(field, !currentValue);
          }
        } else {
          field.toggleAttribute('disabled', currentValue === false);
        }
        break;
      case 'readOnly':
        if (fieldType === 'radio-group' || fieldType === 'checkbox-group') {
          field.querySelectorAll(`input[name=${name}]`).forEach((el) => {
            disableElement(el, currentValue);
          });
        } else if (fieldType === 'drop-down') {
          disableElement(field, currentValue);
        } else {
          field.toggleAttribute('disabled', currentValue === true);
        }
        break;
      case 'label':
        if (fieldWrapper) {
          let labelEl = fieldWrapper.querySelector('.field-label');
          if (labelEl) {
            labelEl.textContent = currentValue.value;
            labelEl.setAttribute('data-visible', currentValue.visible);
          } else if (fieldType === 'button') {
            field.textContent = currentValue.value;
          } else if (currentValue.value !== '') {
            labelEl = createLabel({
              id,
              label: currentValue,
            });
            fieldWrapper.prepend(labelEl);
          }
        }
        break;
      case 'description':
        if (fieldWrapper) {
          let descriptionEl = fieldWrapper.querySelector('.field-description');
          if (descriptionEl) {
            descriptionEl.innerHTML = currentValue;
          } else if (currentValue !== '') {
            descriptionEl = createHelpText({
              id,
              description: currentValue,
            });
            fieldWrapper.append(descriptionEl);
          }
        }
        break;
      case 'items':
        if (currentValue === null) {
          const removeId = prevValue.id;
          field?.querySelector(`#${removeId}`)?.remove();
        } else {
          generateFormRendition({ items: [currentValue] }, field?.querySelector('.repeat-wrapper'));
        }
        break;
      case 'activeChild': handleActiveChild(activeChild, form);
        break;
      case 'valid':
        if (currentValue === true) {
          updateOrCreateInvalidMsg(field, '');
        }
        break;
      default:
        break;
    }
  });
  if (fieldWrapper?.dataset?.subscribe) {
    fieldWrapper.dataset.fieldModelChanged = JSON.stringify(Math.random());
  }
}

function formChanged(payload, form) {
  const { changes } = payload;
  changes.forEach((change) => {
    const { propertyName, currentValue } = change;
    switch (propertyName) {
      case 'activeChild': handleActiveChild(currentValue?.id, form);
        break;
      default:
        break;
    }
  });
}

function handleRuleEngineEvent(e, form, generateFormRendition) {
  const { type, payload } = e;
  if (type === 'fieldChanged') {
    fieldChanged(payload, form, generateFormRendition);
  } else if (type === 'change') {
    formChanged(payload, form);
  } else if (type === 'submitSuccess') {
    submitSuccess(e, form);
  } else if (type === 'submitFailure') {
    submitFailure(e, form);
  }
}

function applyRuleEngine(htmlForm, form, captcha) {
  htmlForm.addEventListener('change', (e) => {
    const field = e.target;
    const { value, name, checked } = field;
    const { id } = field.closest('.field-wrapper').dataset;
    if ((field.type === 'checkbox' && field.dataset.fieldType === 'checkbox-group')) {
      const val = getCheckboxGroupValue(name, htmlForm);
      const el = form.getElement(id);
      el.value = val;
    } else if ((field.type === 'radio' && field.dataset.fieldType === 'radio-group')) {
      const el = form.getElement(id);
      el.value = value;
    } else if (field.type === 'checkbox') {
      form.getElement(id).value = checked ? value : field.dataset.uncheckedValue;
    } else if (field.type === 'file') {
      form.getElement(id).value = Array.from(e?.detail?.files || field.files);
    } else {
      form.getElement(id).value = value;
    }
    // console.log(JSON.stringify(form.exportData(), null, 2));
  });

  htmlForm.addEventListener('focusin', (e) => {
    const field = e.target;
    let { id } = field;
    if (['radio', 'checkbox'].includes(field?.type)) {
      id = field.closest('.field-wrapper').dataset.id;
    }
    form.getElement(id)?.focus();
  });

  htmlForm.addEventListener('click', async (e) => {
    if (e.target.tagName === 'BUTTON') {
      const element = form.getElement(e.target.id);
      if (e.target.type === 'submit' && captcha) {
        const token = await captcha.getToken();
        form.getElement(captcha.id).value = token;
      }
      if (element) {
        element.dispatch({ type: 'click' });
      }
    }
  });
}

export async function loadRuleEngine(formDef, htmlForm, captcha, genFormRendition, data) {
  const ruleEngine = await import('./model/afb-runtime.js');
  const form = ruleEngine.restoreFormInstance(formDef, data);
  window.myForm = form;
  formModel[htmlForm.dataset?.id] = form;
  form.subscribe((e) => {
    handleRuleEngineEvent(e, htmlForm, genFormRendition);
  }, 'fieldChanged');

  form.subscribe((e) => {
    handleRuleEngineEvent(e, htmlForm, genFormRendition);
  }, 'change');

  form.subscribe((e) => {
    handleRuleEngineEvent(e, htmlForm);
  }, 'submitSuccess');

  form.subscribe((e) => {
    handleRuleEngineEvent(e, htmlForm);
  }, 'submitFailure');

  form.subscribe((e) => {
    handleRuleEngineEvent(e, htmlForm);
  }, 'submitError');
  applyRuleEngine(htmlForm, form, captcha);
}

async function fetchData({ id }) {
  try {
    const { search = '' } = window.location;
    const url = externalize(`/adobe/forms/af/data/${id}${search}`);
    const response = await fetch(url);
    const json = await response.json();
    const { data: prefillData } = json;
    const { data: { afData: { afBoundData: { data = {} } = {} } = {} } = {} } = json;
    return Object.keys(data).length > 0 ? data : (prefillData || json);
  } catch (ex) {
    return null;
  }
}

export async function initAdaptiveForm(formDef, createForm) {
  const data = await fetchData(formDef);
  await registerCustomFunctions();
  const form = await initializeRuleEngineWorker({
    ...formDef,
    data,
  }, createForm);
  return form;
}

/**
 * Subscribes to changes in the specified field element and triggers a callback
 * with access to formModel when changes occur.
 * @param {HTMLElement} fieldDiv - The field element to observe for changes.
 * @param {Function} callback - The callback function to execute when changes are detected.
 */
export function subscribe(fieldDiv, callback) {
  if (callback) {
    fieldDiv.dataset.subscribe = true;
    const observer = new MutationObserver((mutationsList) => {
      mutationsList?.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-field-model-changed') {
          callback(fieldDiv, formModel[fieldDiv.closest('form')?.dataset?.id]);
        }
      });
    });
    observer.observe(fieldDiv, { attributes: true });
  }
}
