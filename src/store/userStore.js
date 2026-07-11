"use client";

import { create } from "zustand";

const useUserStore = create((set) => ({
  user: null,
  loading: false,
  error: null,

  setUser: (user) => set({ user }),

  clearUser: () => set({ user: null }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  fetchCurrentUser: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load current user");
      const data = await response.json();
      set({
        user: data.username ? { id: data.userId, username: data.username, role: data.role, displayName: data.displayName } : null,
        loading: false,
      });
    } catch (error) {
      set({ user: null, error: error.message, loading: false });
    }
  },
}));

export default useUserStore;

