import { createContext, useContext, useEffect, useState } from "react";
import { API_BASE } from "../config/api";
import { normalizeUser } from "../utils/roleAccess";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("bb_user")) || null;
    } catch {
      return null;
    }
  });
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE}/user/profile`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const normalized = normalizeUser(data?.user);
          if (normalized) {
            sessionStorage.setItem("bb_user", JSON.stringify(normalized));
            setUser(normalized);
          }
        } else if (res.status === 401 || res.status === 403) {
          sessionStorage.removeItem("bb_user");
          setUser(null);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("Auth check failed:", err.message);
        }
      })
      .finally(() => setCheckingAuth(false));

    return () => controller.abort();
  }, []);

  const login = (userData) => {
    const normalized = normalizeUser(userData);
    if (normalized) {
      sessionStorage.setItem("bb_user", JSON.stringify(normalized));
    }
    setUser(normalized);
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      sessionStorage.removeItem("bb_user");
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