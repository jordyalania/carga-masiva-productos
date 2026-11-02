import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, DEMO_MODE, readSession, SESSION_KEY, type Session } from "./api";

const AuthContext = createContext<{
  session: Session | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const queries = useQueryClient();
  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    queries.clear();
  };
  useEffect(() => {
    setSession(readSession());
    setReady(true);
    const expired = () => {
      sessionStorage.removeItem(SESSION_KEY);
      setSession(null);
      queries.clear();
    };
    window.addEventListener("auth:expired", expired);
    return () => window.removeEventListener("auth:expired", expired);
  }, [queries]);
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(
      logout,
      Math.max(0, Date.parse(session.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);
  const login = async (email: string, password: string) => {
    const next = DEMO_MODE
      ? {
          accessToken: "demo",
          email: email || "demo@example.test",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        }
      : await api.login(email, password);
    queries.clear();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  };
  return (
    <AuthContext.Provider value={{ session, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
