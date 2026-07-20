(() => {
  'use strict';
  const Account = window.MMOmonAccount;
  const dialog = document.querySelector('[data-account-dialog]');
  const openButtons = [...document.querySelectorAll('[data-account-open]')];
  const signInButton = document.querySelector('[data-account-open="login"]');
  const signUpButton = document.querySelector('[data-account-open="register"]');
  const profileControl = document.querySelector('[data-profile-control]');
  const profileButton = document.querySelector('[data-account-profile]');
  const profileMenu = document.querySelector('[data-profile-menu]');
  const profileIdentity = document.querySelector('[data-profile-identity]');
  const profileLogout = document.querySelector('[data-profile-logout]');
  const closeButton = document.querySelector('[data-account-close]');
  const status = document.querySelector('[data-account-status]');
  const tabs = [...document.querySelectorAll('[data-auth-tab]')];
  const forms = [...document.querySelectorAll('[data-auth-form]')];
  const forgotButton = document.querySelector('[data-auth-action="forgot"]');
  const resendButton = document.querySelector('[data-auth-action="resend"]');
  const actionButtons = [...document.querySelectorAll('[data-auth-action]')];
  const discordButtons = [...document.querySelectorAll('[data-discord-auth]')];
  const welcome = document.querySelector('[data-account-welcome]');
  const welcomeTitle = document.querySelector('[data-welcome-title]');
  const welcomeCopy = document.querySelector('[data-welcome-copy]');
  const welcomeClose = document.querySelector('[data-welcome-close]');
  let session = Account.readSession();
  let activeView = 'login';
  let resetToken = '';
  let emailFeatures = { verification: false, reset: false };
  let discordEnabled = false;
  let showingWelcome = false;

  function setStatus(message = '', isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function showDialog() {
    closeProfileMenu();
    if (typeof dialog?.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog?.setAttribute('open', '');
    if (dialog) dialog.scrollTop = 0;
  }

  function closeDialog() {
    if (typeof dialog?.close === 'function' && dialog.open) dialog.close();
    else dialog?.removeAttribute('open');
  }

  function identityLabel() {
    if (!session) return 'Signed in';
    return session.email || session.discordUsername || 'Discord account';
  }

  function render() {
    const signedIn = Boolean(session?.token);
    if (signInButton) signInButton.hidden = signedIn;
    if (signUpButton) signUpButton.hidden = signedIn;
    if (profileControl) profileControl.hidden = !signedIn;
    if (profileIdentity) profileIdentity.textContent = identityLabel();
    forms.forEach(form => { form.hidden = showingWelcome || form.dataset.authForm !== activeView; });
    tabs.forEach(tab => {
      tab.hidden = showingWelcome || !['login', 'register'].includes(activeView);
      tab.setAttribute('aria-selected', String(tab.dataset.authTab === activeView));
    });
    if (welcome) welcome.hidden = !showingWelcome;
    if (forgotButton) forgotButton.hidden = !emailFeatures.reset || activeView !== 'login' || showingWelcome;
    discordButtons.forEach(button => {
      button.hidden = showingWelcome;
      button.disabled = !discordEnabled;
      button.title = discordEnabled ? '' : 'Discord account sign-in is awaiting MMOmon application setup.';
    });
  }

  function selectView(name, clearStatus = true) {
    activeView = name;
    showingWelcome = false;
    if (name !== 'login' && resendButton) resendButton.hidden = true;
    render();
    if (clearStatus) setStatus('');
  }

  function acceptSession(result) {
    session = Account.setSession(result);
    render();
  }

  function showWelcome(kind = 'email', needsVerification = false) {
    showingWelcome = true;
    if (needsVerification) {
      welcomeTitle.textContent = 'Check your email to finish joining.';
      welcomeCopy.textContent = 'Your MMOmon account was created successfully. Open the verification link we sent, then use the same account in the game client.';
    } else if (kind === 'discord') {
      welcomeTitle.textContent = 'Welcome to MMOmon.';
      welcomeCopy.textContent = 'Your Discord account is connected, you have joined the MMOmon server, and your website account is ready. Create your first trainer profile inside the game client.';
    } else {
      welcomeTitle.textContent = 'Your MMOmon account is ready.';
      welcomeCopy.textContent = 'Signup was successful. Use the same email and password in the game client, then create your first trainer profile in-game.';
    }
    setStatus('Account created successfully.');
    render();
    showDialog();
  }

  function toggleProfileMenu(force) {
    if (!profileMenu || !profileButton) return;
    const open = force ?? profileMenu.hidden;
    profileMenu.hidden = !open;
    profileButton.setAttribute('aria-expanded', String(open));
  }
  function closeProfileMenu() { toggleProfileMenu(false); }

  function errorMessage(error) {
    const code = error?.message;
    if (code === 'email_unavailable') return 'An account already exists for that email.';
    if (code === 'invalid_credentials') return 'The email or password is incorrect.';
    if (code === 'email_not_verified') return 'Verify your email before signing in.';
    if (code === 'email_delivery_unavailable') return 'Account email is being configured. Try again later.';
    if (code === 'invalid_or_expired_token') return 'This link is invalid, expired, or already used.';
    if (code === 'rate_limited') return 'Too many attempts. Try again in 15 minutes.';
    if (code === 'invalid_email') return 'Enter a valid email address.';
    if (code === 'invalid_password') return 'Use a password between 10 and 128 characters.';
    if (code === 'discord_auth_unavailable' || code === 'unavailable') return 'Discord sign-in is being configured.';
    if (code === 'discord_guild_join_failed') return 'Discord connected, but joining the MMOmon server failed. Try again after the bot is installed.';
    if (code === 'discord_already_linked') return 'That Discord account is already linked to another MMOmon account.';
    if (code === 'access_denied' || code === 'cancelled') return 'Discord sign-in was cancelled.';
    if (code === 'request_timeout') return 'The account server did not respond in time.';
    return 'Could not complete the account request. Try again shortly.';
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
    setStatus({ register: 'Creating your account…', login: 'Signing in…', forgot: 'Sending reset link…', reset: 'Resetting password…' }[kind] || 'Working…');
    try {
      if (kind === 'forgot') {
        await Account.api('/v1/auth/forgot-password', { body: { email: data.email } });
        form.reset(); selectView('login', false);
        setStatus('If that verified account exists, a password-reset link has been sent.');
        return;
      }
      if (kind === 'reset') {
        await Account.api('/v1/auth/reset-password', { body: { token: resetToken, password: data.password } });
        form.reset(); resetToken = ''; clearAuthQuery(); selectView('login', false);
        setStatus('Password reset. Sign in with your new password.');
        return;
      }
      const result = await Account.api(kind === 'register' ? '/v1/auth/register' : '/v1/auth/login', { body: { email: data.email, password: data.password } });
      form.reset();
      if (kind === 'register') {
        if (result.token) acceptSession(result);
        showWelcome('email', Boolean(result.verificationRequired));
      } else {
        acceptSession(result);
        closeDialog();
      }
    } catch (error) {
      if (kind === 'login' && error?.message === 'email_not_verified' && resendButton && emailFeatures.verification) resendButton.hidden = false;
      setStatus(errorMessage(error), true);
    } finally { submit.disabled = false; }
  }

  async function resendVerification() {
    const email = document.querySelector('[data-auth-form="login"] input[name="email"]')?.value || '';
    if (!email) { setStatus('Enter your email first.', true); return; }
    resendButton.disabled = true; setStatus('Sending verification email…');
    try { await Account.api('/v1/auth/resend-verification', { body: { email } }); setStatus('If that unverified account exists, a new verification link has been sent.'); }
    catch (error) { setStatus(errorMessage(error), true); }
    finally { resendButton.disabled = false; }
  }

  function clearAuthQuery() {
    const url = new URL(location.href);
    ['verify', 'reset'].forEach(key => url.searchParams.delete(key));
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function processAuthLinks() {
    const url = new URL(location.href), verifyToken = url.searchParams.get('verify'), candidateReset = url.searchParams.get('reset');
    try {
      const discordResult = await Account.completeDiscordFromUrl();
      if (discordResult) {
        session = Account.readSession();
        if (discordResult.createdAccount) showWelcome('discord');
        else { render(); closeDialog(); }
      }
    } catch (error) {
      selectView('login', false); showDialog(); setStatus(errorMessage(error), true);
    }
    if (verifyToken) {
      showDialog(); setStatus('Verifying your email…');
      try { const result = await Account.api('/v1/auth/verify-email', { body: { token: verifyToken } }); clearAuthQuery(); acceptSession(result); showWelcome('email'); }
      catch (error) { clearAuthQuery(); selectView('login', false); setStatus(errorMessage(error), true); }
      return;
    }
    if (candidateReset) { resetToken = candidateReset; showDialog(); selectView('reset', false); setStatus('Choose a new password. This link can only be used once.'); }
  }

  async function loadCapabilities() {
    try {
      const config = await Account.api('/v1/client/config');
      emailFeatures = { verification: Boolean(config?.features?.emailVerification), reset: Boolean(config?.features?.passwordReset) };
      discordEnabled = Boolean(config?.features?.discord?.enabled);
    } catch {
      emailFeatures = { verification: false, reset: false }; discordEnabled = false;
    }
    render();
  }

  openButtons.forEach(button => button.addEventListener('click', () => { selectView(button.dataset.accountOpen || 'login'); showDialog(); }));
  profileButton?.addEventListener('click', event => { event.stopPropagation(); toggleProfileMenu(); });
  profileMenu?.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('click', closeProfileMenu);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeProfileMenu(); });
  closeButton?.addEventListener('click', closeDialog);
  welcomeClose?.addEventListener('click', closeDialog);
  dialog?.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
  tabs.forEach(tab => tab.addEventListener('click', () => selectView(tab.dataset.authTab)));
  forms.forEach(form => form.addEventListener('submit', event => { event.preventDefault(); submitAuth(form); }));
  actionButtons.forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.authAction;
    if (action === 'forgot') selectView('forgot');
    else if (action === 'back') selectView('login');
    else if (action === 'resend') resendVerification();
  }));
  discordButtons.forEach(button => button.addEventListener('click', async () => {
    button.disabled = true; setStatus('Opening Discord…');
    try { await Account.startDiscord('login', '/'); }
    catch (error) { button.disabled = false; setStatus(errorMessage(error), true); }
  }));
  profileLogout?.addEventListener('click', async () => { closeProfileMenu(); await Account.logout(); session = null; render(); });
  window.addEventListener('mmomon:session', event => { session = event.detail; render(); });

  render(); loadCapabilities(); processAuthLinks();
})();
