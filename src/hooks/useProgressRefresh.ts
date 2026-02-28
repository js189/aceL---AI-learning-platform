"use client";

import { useEffect, useCallback, useState } from "react";
import { dispatchProgressUpdate } from "@/lib/progressEvents";
import { getStreak } from "@/lib/storage";

/** Hook that returns [streak, refresh] - re-renders when progress event fires */
export function useStreakRefresh() {
  const [streak, setStreak] = useState(() => getStreak().streak);

  const refresh = useCallback(() => {
    setStreak(getStreak().streak);
  }, []);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("progress-updated", handler);
    return () => window.removeEventListener("progress-updated", handler);
  }, [refresh]);

  return [streak, refresh] as const;
}

/** Call after any progress-saving action to notify UI to refresh */
export { dispatchProgressUpdate };
