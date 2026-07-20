(() => {
  'use strict';
  const API_BASE = 'https://mmomon-edge-authority.ajis90.workers.dev';
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
  const forgotButton = document.querySelector('[data-auth-action="forgot"]');
  const resendButton = document.querySelector('[data-auth-action="resend"]');
  const actionButtons = [...document.querySelectorAll('[data-auth-action]')];
  let signedIn = false;
  let sessionToken = '';
  let activeView = 'login';
  let resetToken = '';
  let emailFeatures = { verification: false, reset: false };

  function setStatus(message = '', isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function showDialog() {
    if (typeof dialog?.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog?.setAttribute('open', '');
    if (dialog) dialog.scrollTop = 0;
  }

  function render() {
    sessionPanel.hidden = !signedIn;
    forms.forEach(form => { form.hidden = signedIn || form.dataset.authForm !== activeView; });
    tabs.forEach(tab => {
      tab.hidden = signedIn || !['login', 'register'].includes(activeView);
      tab.setAttribute('aria-selected', String(tab.dataset.authTab === activeView));
    });
    signInButton?.classList.toggle('is-authenticated', signedIn);
    if (signInButton) signInButton.textContent = signedIn ? (accountName.textContent || 'Account') : 'Sign in';
    if (signUpButton) signUpButton.hidden = signedIn;
    if (forgotButton) forgotButton.hidden = !emailFeatures.reset || activeView !== 'login';
  }

  function selectView(name, clearStatus = true) {
    activeView = name;
    signedIn = false;
    if (name !== 'login' && resendButton) resendButton.hidden = true;
    render();
    if (clearStatus) setStatus('');
  }

  async function api(path, body = null, token = '', method = 'POST') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { Accept: 'application/json', ...(body !== null ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body !== null ? { body: JSON.stringify(body) } : {}),
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
    if (error?.message === 'email_not_verified') return 'Verify your email before signing in.';
    if (error?.message === 'email_delivery_unavailable') return 'Account email is being configured. Try again later.';
    if (error?.message === 'invalid_or_expired_token') return 'This link is invalid, expired, or already used.';
    if (error?.message === 'rate_limited') return 'Too many attempts. Try again in 15 minutes.';
    if (error?.message === 'invalid_email') return 'Enter a valid email address.';
    if (error?.message === 'invalid_password') return 'Use a password between 10 and 128 characters.';
    if (error?.message === 'bad_request') return 'Check the fields and try again.';
    if (error?.message === 'request_timeout') return 'The account server did not respond in time.';
    return 'Could not reach the MMOmon account server. Try again shortly.';
  }

  function acceptSession(result, fallbackEmail = '') {
    signedIn = true;
    sessionToken = result.token || '';
    accountName.textContent = result.email || fallbackEmail;
    activeView = 'login';
    render();
  }

  async function submitAuth(form) {
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    const kind = form.dataset.authForm;
    if (['register', 'reset'].includes(kind) && data.password !== data.confirmPassword) {
      setStatus('The passwords do not match.', true);
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    const working = { register: 'Creating your account…', login: 'Signing in…', forgot: 'Sending reset link…', reset: 'Resetting password…' };
    setStatus(working[kind] || 'Working…');
    try {
      if (kind === 'forgot') {
        await api('/v1/auth/forgot-password', { email: data.email });
        form.reset();
        selectView('login', false);
        setStatus('If that verified account exists, a password-reset link has been sent.');
        return;
      }
      if (kind === 'reset') {
        await api('/v1/auth/reset-password', { token: resetToken, password: data.password });
        form.reset();
        resetToken = '';
        clearAuthQuery();
        selectView('login', false);
        setStatus('Password reset. Sign in with your new password.');
        return;
      }
      const path = kind === 'register' ? '/v1/auth/register' : '/v1/auth/login';
      const result = await api(path, { email: data.email, password: data.password });
      if (result.verificationRequired) {
        form.reset();
        selectView('login', false);
        setStatus('Account created. Check your email for the verification link.');
        return;
      }
      acceptSession(result, data.email);
      form.reset();
      setStatus(kind === 'register'
        ? 'Account created. Use the same email and password in the MMOmon client.'
        : 'Sign-in verified. Use the same email and password in the MMOmon client.');
    } catch (error) {
      if (kind === 'login' && error?.message === 'email_not_verified' && resendButton && emailFeatures.verification) resendButton.hidden = false;
      setStatus(errorMessage(error), true);
    } finally {
      submit.disabled = false;
    }
  }

  async function resendVerification() {
    const email = document.querySelector('[data-auth-form="login"] input[name="email"]')?.value || '';
    if (!email) { setStatus('Enter your email first.', true); return; }
    resendButton.disabled = true;
    setStatus('Sending verification email…');
    try {
      await api('/v1/auth/resend-verification', { email });
      setStatus('If that unverified account exists, a new verification link has been sent.');
    } catch (error) { setStatus(errorMessage(error), true); }
    finally { resendButton.disabled = false; }
  }

  function clearAuthQuery() {
    const url = new URL(location.href);
    url.searchParams.delete('verify');
    url.searchParams.delete('reset');
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function processAuthLink() {
    const url = new URL(location.href), verifyToken = url.searchParams.get('verify'), candidateReset = url.searchParams.get('reset');
    if (verifyToken) {
      showDialog();
      setStatus('Verifying your email…');
      try {
        const result = await api('/v1/auth/verify-email', { token: verifyToken });
        clearAuthQuery();
        acceptSession(result);
        setStatus('Email verified. Your MMOmon account is ready.');
      } catch (error) {
        clearAuthQuery();
        selectView('login', false);
        setStatus(errorMessage(error), true);
      }
      return;
    }
    if (candidateReset) {
      resetToken = candidateReset;
      showDialog();
      selectView('reset', false);
      setStatus('Choose a new password. This link can only be used once.');
    }
  }

  async function loadCapabilities() {
    try {
      const config = await api('/v1/client/config', null, '', 'GET');
      emailFeatures = { verification: Boolean(config?.features?.emailVerification), reset: Boolean(config?.features?.passwordReset) };
    } catch { emailFeatures = { verification: false, reset: false }; }
    render();
  }

  openButtons.forEach(button => button.addEventListener('click', () => {
    if (!signedIn) selectView(button.dataset.accountOpen || 'login');
    showDialog();
  }));
  closeButton?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  tabs.forEach(tab => tab.addEventListener('click', () => selectView(tab.dataset.authTab)));
  forms.forEach(form => form.addEventListener('submit', event => { event.preventDefault(); submitAuth(form); }));
  actionButtons.forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.authAction;
    if (action === 'forgot') selectView('forgot');
    else if (action === 'back') selectView('login');
    else if (action === 'resend') resendVerification();
  }));
  logoutButton?.addEventListener('click', async () => {
    const token = sessionToken;
    sessionToken = '';
    signedIn = false;
    accountName.textContent = '';
    selectView('login');
    if (token) { try { await api('/v1/auth/logout', {}, token); } catch { /* Local session is already cleared. */ } }
    setStatus('Website sign-in cleared.');
  });

  render();
  loadCapabilities();
  processAuthLink();
})();
