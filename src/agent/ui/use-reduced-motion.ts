import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the user has asked the system to reduce motion.
 *
 * Every entrance animation in the panel is skipped when this is true. Motion in
 * a chat surface is constant — a message arrives every few seconds — so
 * honouring the setting matters more here than on a screen the user visits once.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) =>
      setReduced(value),
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
