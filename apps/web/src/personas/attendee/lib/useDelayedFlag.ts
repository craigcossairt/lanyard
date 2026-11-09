import { useEffect, useState } from 'react';

/**
 * True only after `flag` has been continuously true for `ms`. Used so the deliberate ~12 s
 * stream rotation (which reconnects at once) never flashes "Reconnecting…".
 */
export function useDelayedFlag(flag: boolean, ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!flag) {
      setOn(false);
      return;
    }
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [flag, ms]);
  return on;
}
