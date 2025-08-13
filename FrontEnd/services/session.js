const AUTH_KEY = "auth";
const USER_KEY = "user";

export function setSession(user) {
  sessionStorage.setItem(AUTH_KEY, "1");
  if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function isLoggedIn() {
  return sessionStorage.getItem(AUTH_KEY) === "1";
}

export function getSessionUser() {
  const raw = sessionStorage.getItem(USER_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function requireAuth(ctx) {
  if (!isLoggedIn()) {
    const go = ctx?.navigateTo ?? ((u) => (window.location.href = u));
    go("/login");
    throw new Error("Not authenticated");
  }
}
