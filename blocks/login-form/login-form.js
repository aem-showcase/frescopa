/**
 * Login form block for CUG authentication.
 *
 * Renders an email/password form that POSTs to /auth/login.
 * Reads `redirect` and `error` from the page URL search params
 * so the worker can pass back context after a failed attempt.
 */
export default function decorate(block) {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect') || '/';
  const error = params.get('error');

  block.innerHTML = '';

  if (error) {
    const msg = document.createElement('div');
    msg.className = 'login-form-error';
    msg.setAttribute('role', 'alert');
    msg.textContent = error === 'missing'
      ? 'Email and password are required.'
      : 'Invalid email or password.';
    block.append(msg);
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `/auth/login?redirect=${encodeURIComponent(redirect)}`;

  const emailLabel = document.createElement('label');
  emailLabel.htmlFor = 'email';
  emailLabel.textContent = 'Email';

  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.id = 'email';
  emailInput.name = 'email';
  emailInput.required = true;
  emailInput.autocomplete = 'email';
  emailInput.autofocus = true;

  const passwordLabel = document.createElement('label');
  passwordLabel.htmlFor = 'password';
  passwordLabel.textContent = 'Password';

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.id = 'password';
  passwordInput.name = 'password';
  passwordInput.required = true;
  passwordInput.autocomplete = 'current-password';

  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Sign in';

  form.append(emailLabel, emailInput, passwordLabel, passwordInput, button);
  block.append(form);
}
