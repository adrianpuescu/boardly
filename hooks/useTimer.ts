"use client";

import { useEffect, useRef, useState } from "react";

interface UseTimerOptions {
  initialSeconds: number;
  running: boolean;
  onExpire?: () => void;
}

export function useTimer({ initialSeconds, running, onExpire }: UseTimerOptions) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (!running) return;
    if (seconds <= 0) {
      onExpireRef.current?.();
      return;
    }
    const id = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(id);
          onExpireRef.current?.();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, seconds]);

  return { seconds };
}
