(() => {
  'use strict';
  const API_BASE = 'https://api.mmomon.com';
  const dialog = document.querySelector('[data-account-dialog]');
  const openButtons = [...document.querySelectorAll('[data-account-open]')];
  const signInButton = document.querySelector('[data-account-open="login"]');
  const signUpButton = document.querySelector('[data-account-open="register"]');
  const closeButton = document.querySelector('[data-account-close]');
  const status = document.querySelector('[data-account-status]');
  const sessionPanel = document.querySelector('[data-account-session]');
  const accountName = document.querySelector('[data-account-name]');
  const logoutButton = document.querySelector('[data-account-logout]');
  const tabs = [...document.querySelectorAll('[data-auth-tab]')];
  const forms = [...document.querySelectorAll('[data-auth-form]')];
  let signedIn = false;

  function setStatus(message = '', isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function activeTab() {
    return tabs.find(tab => tab.getAttribute('aria-selected') === 'true')?.dataset.authTab || 'login';
  }

  function render() {
    sessionPanel.hidden = !signedIn;
    forms.forEach(form => { form.hidden = signedIn || form.dataset.authForm !== activeTab(); });
    tabs.forEach(tab => { tab.hidden = signedIn; });
    signInButton?.classList.toggle('is-authenticated', signedIn);
    if (signInButton) signInButton.textContent = signedIn ? (accountName.textContent || 'Account') : 'Sign in';
    if (signUpButton) signUpButton.hidden = signedIn;
  }

  function selectTab(name) {
    tabs.forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.authTab === name)));
    signedIn = false;
    render();
    setStatus('');
  }

  async function api(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit',
        mode: 'cors',
        redirect: 'error',
        referrerPolicy: 'strict-origin-when-cross-origin',
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || `request_failed_${response.status}`);
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('request_timeout');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function errorMessage(error) {
    if (error?.message === 'email_unavailable') return 'An account already exists for that email.';
    if (error?.message === 'invalid_credentials') return 'The email or password is incorrect.';
    if (error?.message === 'rate_limited') return 'Too many attempts. Try again in about a minute.';
    if (error?.message === 'bad_request') return 'Check the fields and try again.';
    if (error?.message === 'request_timeout') return 'The account server did not respond in time.';
    return 'Could not reach the MMOmon account server. Try again shortly.';
  }

  async function submitAuth(form) {
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    const kind = form.dataset.authForm;
    if (kind === 'register' && data.password !== data.confirmPassword) {
      setStatus('The passwords do not match.', true);
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    setStatus(kind === 'register' ? 'Creating your account…' : 'Signing in…');
    try {
      const path = kind === 'register' ? '/v1/auth/register' : '/v1/auth/login';
      const body = kind === 'register'
        ? { email: data.email, password: data.password }
        : { email: data.email, password: data.password };
      const result = await api(path, body);
      signedIn = true;
      accountName.textContent = result.email || data.email;
      form.reset();
      render();
      setStatus(kind === 'register'
        ? 'Account created. Use the same email and password in the MMOmon client, then choose your profile name in-game.'
        : 'Sign-in verified. Use the same email and password in the MMOmon client.');
    } catch (error) {
      setStatus(errorMessage(error), true);
    } finally {
      submit.disabled = false;
    }
  }

  openButtons.forEach(button => button.addEventListener('click', () => {
    if (!signedIn) selectTab(button.dataset.accountOpen || 'login');
    if (typeof dialog?.showModal === 'function') dialog.showModal();
    else dialog?.setAttribute('open', '');
    if (dialog) dialog.scrollTop = 0;
  }));
  closeButton?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  tabs.forEach(tab => tab.addEventListener('click', () => selectTab(tab.dataset.authTab)));
  forms.forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    submitAuth(form);
  }));
  logoutButton?.addEventListener('click', () => {
    signedIn = false;
    accountName.textContent = '';
    selectTab('login');
    setStatus('Website sign-in cleared.');
  });

  render();
})();
