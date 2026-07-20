(() => {
  'use strict';
  const API_BASE = 'https://mmomon-edge-authority.ajis90.workers.dev';
  const STORAGE_KEY = 'mmomon.website.session.v1';

  function readSession() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (!value?.token || !value?.expiresAt || Number(value.expiresAt) <= Date.now()) {
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return value;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function setSession(payload) {
    const session = {
      token: payload.token,
      expiresAt: Number(payload.expiresAt),
      accountId: payload.accountId || '',
      email: payload.email || null,
      emailLinked: Boolean(payload.emailLinked),
      discordLinked: Boolean(payload.discordLinked),
      discordUsername: payload.discordUsername || null
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent('mmomon:session', { detail: session }));
    return session;
  }

  function clearSession() {
    sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('mmomon:session', { detail: null }));
  }

  async function api(path, { body = null, token = '', method = body === null ? 'GET' : 'POST' } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== null ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
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
        error.payload = payload;
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

  async function loadProfile() {
    const session = readSession();
    if (!session) return null;
    try {
      const profile = await api('/v1/account/profile', { token: session.token });
      const refreshed = { ...session, email: profile.account.email, emailLinked: profile.account.emailLinked, discordLinked: profile.account.discordLinked, discordUsername: profile.account.discordUsername };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(refreshed));
      return profile;
    } catch (error) {
      if (error.status === 401) clearSession();
      throw error;
    }
  }

  async function logout() {
    const session = readSession();
    clearSession();
    if (session?.token) {
      try { await api('/v1/auth/logout', { body: {}, token: session.token }); } catch { }
    }
  }

  async function startDiscord(intent = 'login', returnPath = location.pathname) {
    const session = readSession();
    const payload = await api('/v1/auth/discord/start', {
      body: { intent, returnPath },
      token: intent === 'link' ? (session?.token || '') : ''
    });
    location.assign(payload.authorizeUrl);
  }

  async function completeDiscordFromUrl() {
    const url = new URL(location.href);
    const handoff = url.searchParams.get('discord');
    const oauthError = url.searchParams.get('discordError');
    if (!handoff && !oauthError) return null;
    url.searchParams.delete('discord');
    url.searchParams.delete('discordError');
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    if (oauthError) {
      const error = new Error(oauthError);
      error.oauth = true;
      throw error;
    }
    const result = await api('/v1/auth/discord/complete', { body: { token: handoff } });
    setSession(result);
    return result;
  }

  window.MMOmonAccount = { API_BASE, api, readSession, setSession, clearSession, loadProfile, logout, startDiscord, completeDiscordFromUrl };
})();
