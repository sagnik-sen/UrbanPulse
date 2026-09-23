import { createContext, useCallback, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export const ROLE_LABEL = { admin: "Admin", officer: "Field officer", viewer: "Viewer" };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sign-in failed");
    setUser(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  // server said the session is gone (expired, or logged out in another tab)
  const expire = useCallback(() => setUser(null), []);

  const can = {
    manage: user?.role === "admin",
    respond: user?.role === "admin" || user?.role === "officer",
  };

  return <AuthContext.Provider value={{ user, loading, login, logout, expire, can }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
