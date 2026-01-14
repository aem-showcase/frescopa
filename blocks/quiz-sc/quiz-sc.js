import { h, render } from '@dropins/tools/preact.js';
import htm from '../../scripts/htm.js';
import Quiz from '../quiz/quiz-module.js';
import { fetchBackendAPI } from '../../scripts/sc-api.js';

/* eslint-disable no-underscore-dangle */
export default async function decorate(block) {
  const html = htm.bind(h);
  
  // Extract the path parameter from the block content
  const quizPathElement = block.querySelector(':scope div:nth-child(1) > div a');
  if (!quizPathElement) {
    return; // Let default decoration happen
  }
  
  const quizpath = quizPathElement.innerHTML.trim();

  let questions = [];
  try {
    // Call the backend API to get content
    const response = await fetchBackendAPI(quizpath);
    
    // Extract questions directly from response
    const questionsData = response?.questions;
    
    if (questionsData && Array.isArray(questionsData)) {
      // Transform the simplified API response to match quiz-module expectations
      questions = questionsData.map((q) => ({
        question: q.question,
        _path: '', // No _path in simplified structure
        options: q.options.map((opt) => ({
          _path: '', // No _path in simplified structure
          description: opt.description,
          image: opt.image ? {
            _dmS7Url: opt.image, // Image is a simple string URL
          } : null,
          imageType: opt.imageType,
          minOption: opt.minOption || null,
          maxOption: opt.maxOption || null,
        })),
      }));
    } else {
      // If no valid data, return to let default decoration happen
      return;
    }
  } catch (e) {
    // Handle error - return early to let default decoration happen
    console.error('Failed to fetch quiz data', e);
    return;
  }

  const itemId = `urn:aemconnection:${quizpath}/jcr:content/data/master`;

  block.innerHTML = '';
  render(html`<div data-aue-resource=${itemId} data-aue-label="quiz content fragment" data-aue-type="reference" data-aue-filter="cf"><${Quiz} questions=${questions} /></div>`, block);
}
