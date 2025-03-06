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
export default async function initializeRuleEngineWorker(formDef, renderHTMLForm) {
  if (typeof Worker === 'undefined') {
    const ruleEngine = await import('./model/afb-runtime.js');
    const form = ruleEngine.createFormInstance(formDef);
    return renderHTMLForm(form.getState(true), formDef.data);
  }
  const myWorker = new Worker(`${window.hlx.codeBasePath}/blocks/form/rules/RuleEngineWorker.js`, { type: 'module' });

  myWorker.postMessage({
    name: 'init',
    payload: formDef,
  });

  return new Promise((resolve) => {
    let form;
    myWorker.addEventListener('message', async (e) => {
      if (e.data.name === 'init') {
        form = await renderHTMLForm(e.data.payload);
        // myWorker.terminate();
        resolve(form);
      }
    });
  });
}
