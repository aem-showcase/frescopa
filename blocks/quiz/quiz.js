import { h, render } from '@dropins/tools/preact.js';
import htm from '../../scripts/htm.js';
import Quiz from './quiz-module.js';
import { getAEMPublish, getAEMAuthor } from '../../scripts/endpointconfig.js';

/* eslint-disable no-underscore-dangle */
export default async function decorate(block) {
  const html = htm.bind(h);
  const aempublishurl = getAEMPublish();
  const aemauthorurl = getAEMAuthor();
  const persistedquery = '/graphql/execute.json/frescopa/QuizByPath';
  const quizpath = block.querySelector(':scope div:nth-child(1) > div a').innerHTML.trim();

  const url = window.location && window.location.origin && window.location.origin.includes('author')
    ? `${aemauthorurl}${persistedquery};path=${quizpath};ts=${Math.random() * 1000}`
    : `${aempublishurl}${persistedquery};path=${quizpath};ts=${Math.random() * 1000}`;
  const options = { credentials: 'include' };

  let questions = [];
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    if (data?.data?.quizByPath?.item?.questions) {
      questions = data.data.quizByPath.item.questions;
    }
  } catch (e) {
    // handle error, optionally show fallback UI
    // eslint-disable-next-line no-console
    console.error('Failed to fetch quiz data', e);
  }

  const itemId = `urn:aemconnection:${quizpath}/jcr:content/data/master`;

  block.innerHTML = '';
  render(html`<div data-aue-resource=${itemId} data-aue-label="quiz content fragment" data-aue-type="reference" data-aue-filter="cf"><${Quiz} questions=${questions} /></div>`, block);
}
