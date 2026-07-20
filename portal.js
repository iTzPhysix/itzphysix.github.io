(() => {
  'use strict';
  const Account = window.MMOmonAccount;
  const page = document.body.dataset.portalPage;
  const profileControl = document.querySelector('[data-profile-control]');
  const profileButton = document.querySelector('[data-account-profile]');
  const profileMenu = document.querySelector('[data-profile-menu]');
  const profileIdentity = document.querySelector('[data-profile-identity]');
  const profileLogout = document.querySelector('[data-profile-logout]');
  const status = document.querySelector('[data-portal-status]');
  let session = Account.readSession();
  let profile = null;
  let config = null;

  function setStatus(message = '', error = false) {
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle('is-error', error);
  }
  function setLocalStatus(element, message = '', error = false) {
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
    element.classList.toggle('is-error', error);
  }
  function formatNumber(value) { return new Intl.NumberFormat().format(Number(value || 0)); }
  function formatDate(value) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(Number(value))) : 'Not yet'; }
  function errorMessage(error) {
    const code = error?.message;
    if (code === 'invalid_current_password') return 'The current password is incorrect.';
    if (code === 'password_unchanged') return 'Choose a different password.';
    if (code === 'email_unavailable') return 'That email is already connected to another MMOmon account.';
    if (code === 'invalid_or_expired_token') return 'This confirmation link is invalid, expired, or already used.';
    if (code === 'email_delivery_unavailable') return 'Email changes are not active until outbound email is configured.';
    if (code === 'discord_auth_unavailable' || code === 'unavailable') return 'Discord linking is ready in code but still needs the Discord application credentials.';
    if (code === 'discord_already_linked') return 'That Discord account is linked to another MMOmon account.';
    if (code === 'email_login_required_before_unlink') return 'Add an email and password before unlinking Discord.';
    if (code === 'discord_guild_join_failed') return 'The Discord bot could not add this account to the MMOmon server.';
    if (code === 'access_denied' || code === 'cancelled') return 'Discord authorization was cancelled.';
    if (code === 'request_timeout') return 'The account server did not respond in time.';
    return 'The account request could not be completed. Try again shortly.';
  }

  function renderNav() {
    const active = Boolean(session?.token);
    if (profileControl) profileControl.hidden = !active;
    if (profileIdentity) profileIdentity.textContent = session?.email || session?.discordUsername || 'Discord account';
  }
  function toggleMenu(force) {
    if (!profileMenu || !profileButton) return;
    const open = force ?? profileMenu.hidden;
    profileMenu.hidden = !open;
    profileButton.setAttribute('aria-expanded', String(open));
  }

  function requireSession() {
    if (session?.token) return true;
    setStatus('Sign in on the MMOmon homepage to view this page. Your website session lasts for the current browser tab.', true);
    const container = document.querySelector('[data-profiles-grid]');
    if (container) container.innerHTML = '<div class="empty-state">No website session found. <a class="portal-back" href="/?account=login">Return home to sign in.</a></div>';
    return false;
  }

  function renderProfilePage(data) {
    document.querySelector('[data-stats-grid]').hidden = false;
    const stat = (key, value) => { const element = document.querySelector(`[data-stat="${key}"]`); if (element) element.textContent = value; };
    stat('characters', formatNumber(data.stats.characterCount));
    stat('regions', formatNumber(data.stats.regionsStarted));
    stat('money', formatNumber(data.stats.totalMoney));
    stat('johto', formatNumber(data.stats.johtoProfiles));
    stat('kanto', formatNumber(data.stats.kantoProfiles));
    stat('checkpoints', formatNumber(data.stats.checkpointMilestones));
    const grid = document.querySelector('[data-profiles-grid]');
    if (!data.profiles.length) {
      grid.innerHTML = '<div class="empty-state">No trainer profiles have synced yet. Create one inside the MMOmon game client and it will appear here.</div>';
      return;
    }
    grid.innerHTML = data.profiles.map(item => `<article class="profile-card"><div class="profile-card-top"><span class="profile-slot">Slot ${Number(item.slot) + 1}</span><span class="profile-region">${escapeHtml(item.startRegion)}</span></div><h3>${escapeHtml(item.name)}</h3><div class="profile-facts"><div class="profile-fact"><span>Money</span><strong>${formatNumber(item.money)}</strong></div><div class="profile-fact"><span>Checkpoints</span><strong>${formatNumber(item.checkpointSequence)}</strong></div><div class="profile-fact"><span>Latest map</span><strong>${formatNumber(item.mapHeader)}</strong></div><div class="profile-fact"><span>Last sync</span><strong>${formatDate(item.lastActiveAt)}</strong></div></div></article>`).join('');
  }

  function renderSettingsPage(data) {
    const account = data.account, settings = document.querySelector('[data-settings]');
    settings.hidden = false;
    document.querySelector('[data-settings-email]').textContent = account.email || 'Discord-only account';
    const emailState = document.querySelector('[data-email-state]');
    emailState.textContent = account.emailLinked ? (account.emailVerified ? 'Verified' : 'Linked') : 'Not linked';
    emailState.classList.toggle('off', !account.emailLinked);
    document.querySelector('[data-settings-discord]').textContent = account.discordUsername || 'Not linked';
    const discordState = document.querySelector('[data-discord-state]');
    discordState.textContent = account.discordLinked ? 'Linked' : 'Not linked';
    discordState.classList.toggle('off', !account.discordLinked);
    const passwordCard = document.querySelector('[data-password-card]');
    passwordCard.hidden = !account.emailLinked;
    const currentField = document.querySelector('[data-current-password-field]');
    const newField = document.querySelector('[data-new-password-field]');
    const confirmField = document.querySelector('[data-confirm-password-field]');
    currentField.hidden = !account.emailLinked;
    newField.hidden = account.emailLinked;
    confirmField.hidden = account.emailLinked;
    currentField.querySelector('input').required = account.emailLinked;
    newField.querySelector('input').required = !account.emailLinked;
    confirmField.querySelector('input').required = !account.emailLinked;
    document.querySelector('[data-email-card-title]').textContent = account.emailLinked ? 'Change email' : 'Add email and password';
    const emailAvailable = Boolean(config?.features?.emailChange);
    document.querySelector('[data-email-card-copy]').textContent = emailAvailable
      ? (account.emailLinked ? 'Send a one-time confirmation link to your new email address.' : 'Add a verified email and password so you can use either Discord or email sign-in.')
      : 'Email changes are implemented but remain unavailable until MMOmon outbound account email is activated.';
    const discordFeature = config?.features?.discord || {}, link = document.querySelector('[data-discord-link]'), sync = document.querySelector('[data-discord-sync]'), unlink = document.querySelector('[data-discord-unlink]');
    link.hidden = account.discordLinked;
    link.disabled = !discordFeature.enabled;
    link.textContent = discordFeature.enabled ? 'Link Discord' : 'Discord setup required';
    sync.hidden = !account.discordLinked;
    unlink.hidden = !account.discordLinked || !account.emailLinked;
    const emailSubmit = document.querySelector('[data-email-form] button[type="submit"]');
    emailSubmit.disabled = !emailAvailable;
  }

  async function load() {
    renderNav();
    try {
      config = await Account.api('/v1/client/config');
      const discordResult = await Account.completeDiscordFromUrl();
      if (discordResult) {
        session = Account.readSession();
        setStatus(discordResult.createdAccount ? 'Discord account created and linked.' : 'Discord linked successfully.');
      }
      const url = new URL(location.href), emailChange = url.searchParams.get('emailChange');
      if (emailChange) {
        url.searchParams.delete('emailChange'); history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        setStatus('Confirming your email change…');
        const result = await Account.api('/v1/account/email-change/confirm', { body: { token: emailChange } });
        session = Account.setSession(result); setStatus('Email sign-in updated successfully.');
      }
    } catch (error) { setStatus(errorMessage(error), true); }
    renderNav();
    if (!requireSession()) return;
    try {
      profile = await Account.loadProfile();
      session = Account.readSession(); renderNav();
      if (page === 'profile') renderProfilePage(profile);
      if (page === 'settings') renderSettingsPage(profile);
    } catch (error) { setStatus(errorMessage(error), true); }
  }

  document.querySelector('[data-email-form]')?.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
    if (!profile.account.emailLinked && values.newPassword !== values.confirmPassword) { setStatus('The passwords do not match.', true); return; }
    const button = form.querySelector('button[type="submit"]'); button.disabled = true; setStatus('Sending confirmation email…');
    try { await Account.api('/v1/account/email-change/request', { body: values, token: session.token }); form.reset(); setStatus('Check the new email address for a one-time confirmation link.'); }
    catch (error) { setStatus(errorMessage(error), true); }
    finally { button.disabled = !Boolean(config?.features?.emailChange); }
  });

  document.querySelector('[data-password-form]')?.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
    if (values.newPassword !== values.confirmPassword) { setStatus('The passwords do not match.', true); return; }
    const button = form.querySelector('button[type="submit"]'); button.disabled = true; setStatus('Changing password…');
    try { const result = await Account.api('/v1/account/password', { body: values, token: session.token }); session = Account.setSession(result); form.reset(); setStatus('Password changed. Other sessions were signed out.'); }
    catch (error) { setStatus(errorMessage(error), true); }
    finally { button.disabled = false; }
  });

  document.querySelector('[data-discord-link]')?.addEventListener('click', async event => { event.currentTarget.disabled = true; setStatus('Opening Discord…'); try { await Account.startDiscord('link', '/settings/'); } catch (error) { event.currentTarget.disabled = false; setStatus(errorMessage(error), true); } });
  document.querySelector('[data-discord-sync]')?.addEventListener('click', async event => { const local = document.querySelector('[data-discord-message]'); event.currentTarget.disabled = true; setLocalStatus(local, 'Synchronizing profile roles…'); try { const result = await Account.api('/v1/account/discord/sync', { body: {}, token: session.token }); const summary = result.configured ? `Roles synchronized. Added: ${result.assigned.join(', ') || 'none'}.` : 'Discord is linked. Custom role IDs have not been configured yet.'; setLocalStatus(local, summary); } catch (error) { setLocalStatus(local, errorMessage(error), true); } finally { event.currentTarget.disabled = false; } });
  document.querySelector('[data-discord-unlink]')?.addEventListener('click', async event => { event.currentTarget.disabled = true; try { await Account.api('/v1/account/discord/unlink', { body: {}, token: session.token }); setStatus('Discord unlinked.'); profile = await Account.loadProfile(); renderSettingsPage(profile); } catch (error) { setStatus(errorMessage(error), true); event.currentTarget.disabled = false; } });
  profileButton?.addEventListener('click', event => { event.stopPropagation(); toggleMenu(); });
  profileMenu?.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('click', () => toggleMenu(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') toggleMenu(false); });
  profileLogout?.addEventListener('click', async () => { await Account.logout(); location.assign('/'); });
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character])); }
  load();
})();
