/* eslint-disable no-underscore-dangle */
/* eslint-disable function-call-argument-newline */
/* eslint-disable function-paren-newline */
import { h } from '@dropins/tools/preact.js';
import { useState } from '@dropins/tools/preact-hooks.js';

// eslint-disable-next-line max-len
const isSliderQuestion = (q) => q.options && q.options.every((opt) => opt.minOption && opt.maxOption && !opt.description && !opt.image);

export default function Quiz({ questions = [] }) {
  const [step, setStep] = useState(0); // 0..questions.length: questions, then result
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [answers, setAnswers] = useState([]);
  const totalSteps = questions.length;

  // Handle answer selection
  const handleAnswer = (option, idx, thisstep) => {
    setAnswers((prev) => [...prev, { option, idx, thisstep }]);
    setStep((prev) => prev + 1);
  };

  // Handle slider answers
  const handleSliderAnswer = () => {
    setStep((prev) => prev + 1);
  };

  // Handle login form submission
  const handleLogin = (e) => {
    e.preventDefault();
    // TODO: Implement login logic
  };

  // Render result view
  if (step === totalSteps) {
    // console.log('All answers:', answers);
    // console.log(answers[0].idx);

    const coffeeProfile = { title: '', segment: '' };
    if (answers[0].idx === 0) {
      coffeeProfile.title = 'Sandy Sipper';
    } else {
      coffeeProfile.title = 'Coffee Explorer';
    }

    return h('div', { className: 'quiz-results' },
      h('h2', { className: 'profile-heading' }, 'Your coffee profile:'),
      h('div', { className: 'quiz-result' },
        h('h1', { className: 'profile-title' }, coffeeProfile.title),
        h('div', { className: 'profile-subtitle' }, 'What does it mean?'),
        h('h2', { className: 'login-title' }, 'Sign in or create an account'),
        h('p', { className: 'login-subtitle' }, 'to get your full MyBarista coffee quiz results and add recommendations to your profile!'),
        h('div', { className: 'login-form-container' },
          h('form', {
            className: 'login-form',
            onSubmit: handleLogin,
          },
          h('label', { htmlFor: 'email', className: 'login-label' }, 'Email'),
          h('input', {
            type: 'email',
            id: 'email',
            className: 'login-input',
            value: email,
            onChange: (e) => setEmail(e.target.value),
            required: true,
            autoComplete: 'email',
          }),
          h('label', { htmlFor: 'password', className: 'login-label' }, 'Password'),
          h('input', {
            type: 'password',
            id: 'password',
            className: 'login-input',
            value: password,
            onChange: (e) => setPassword(e.target.value),
            required: true,
            autoComplete: 'current-password',
          }),
          h('button', {
            type: 'submit',
            className: 'button primary',
          }, 'Sign in'),
          h('a', {
            href: '#',
            className: 'login-forgot',
            tabIndex: 0,
          }, 'Forgot Password?'),
          ),
          h('div', { className: 'login-bottom-text' },
            "Don't have a Fréscopa account yet? ",
            h('a', { href: '#', className: 'login-create' }, 'Create one today'),
          ),
          h('button', {
            className: 'button secondary',
            onClick: () => {
              setStep(0);
              setAnswers([]);
            },
          }, 'Restart Quiz'),
        ),
      ),
    );
  }

  // Render current question
  const currentQuestion = questions[step];

  // Slider question
  if (isSliderQuestion(currentQuestion)) {
    const [sliderValues, setSliderValues] = useState(currentQuestion.options.map(() => 5));
    const handleSliderChange = (idx, value) => {
      const newValues = [...sliderValues];
      newValues[idx] = value;
      setSliderValues(newValues);
    };
    return h('div', { className: `quiz-inner-container step-${step}` },
      h('h2', null, currentQuestion.question),
      h('form', {
        className: 'quiz-options',
        style: { flexDirection: 'column', gap: '32px', width: '100%' },
        onSubmit: (e) => {
          e.preventDefault();
          handleSliderAnswer();
        },
      },
      ...currentQuestion.options.map((opt, idx) => h('div', {
        key: idx,
        className: 'quiz-slider-row',
      },
      h('div', { className: 'quiz-slider-labels' },
        h('span', { className: 'quiz-slider-label' }, opt.minOption),
        h('span', { className: 'quiz-slider-label right' }, opt.maxOption),
      ),
      h('input', {
        type: 'range',
        min: '0',
        max: '10',
        value: sliderValues[idx],
        onInput: (e) => handleSliderChange(idx, Number(e.target.value)),
        className: 'quiz-slider',
      }),
      ),
      ),
      h('div', { className: 'cta' },
        h('a', {
          href: '#',
          className: 'button',
          role: 'button',
          onClick: (e) => {
            e.preventDefault();
            handleSliderAnswer();
          },
        }, 'Get Your Results'),
      ),
      ),
      h('div', { className: 'quiz-progress' }, `Question ${step + 1} of ${totalSteps}`),
    );
  }

  // Regular question (image or text options)
  return h('div', { 'data-aue-resource': `urn:aemconnection:${currentQuestion._path}/jcr:content/data/master`, className: `quiz-inner-container step-${step}` },
    h('h2', { 'data-aue-prop': 'question', 'data-aue-label': 'question', 'data-aue-type': 'text' }, currentQuestion.question),
    h('div', { className: 'quiz-options' },
      ...currentQuestion.options.map((opt, idx) => h('button', {
        key: idx,
        'data-aue-resource': `urn:aemconnection:${opt._path}/jcr:content/data/master`,
        onClick: () => handleAnswer(opt, idx, step),
      },
      opt.image && opt.image._dmS7Url
      && h('div', { className: `quiz-option-img-wrapper-${opt.imageType}` },
        h('img', {
          src: `${opt.image._dmS7Url}${opt.image._dmS7Url.includes('?') ? '&' : '?'}wid=520`,
          alt: opt.description || '',
          'data-aue-prop': 'image',
          'data-aue-label': 'image',
          'data-aue-type': 'media',
        }),
      ),
      h('span', {
        'data-aue-prop': 'description',
        'data-aue-label': 'description',
        'data-aue-type': 'text',
        className: 'quiz-option-description',
      }, opt.description),
      ),
      ),
    ),
    h('div', { className: 'quiz-progress' }, `Question ${step + 1} of ${totalSteps}`),
  );
}
