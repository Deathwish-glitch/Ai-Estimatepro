import { useEffect, useState } from "react";

export const useChartReady = (delay = 120) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return ready;
};