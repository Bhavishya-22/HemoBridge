import { createContext, useContext, useEffect, useState } from "react";
import { API_BASE } from "../config/api";
import { normalizeUser } from "../utils/roleAccess";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE}/user/profile`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(normalizeUser(data?.user)))
      .catch((err) => {
        if (err.name !== "AbortError") setUser(null);
      })
      .finally(() => setCheckingAuth(false));

    return () => controller.abort();
  }, []);

  const login = (userData) => setUser(normalizeUser(userData));

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoggedIn: !!user, checkingAuth, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}