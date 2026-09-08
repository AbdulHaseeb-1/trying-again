import { useAppTheme } from '@/components/theme-provider';

/**
 * Back-compat hook: returns the resolved color palette.
 * For mode switching, use `useAppTheme()` instead.
 */
export function useTheme() {
  return useAppTheme().colors;
}

export { useAppTheme };
