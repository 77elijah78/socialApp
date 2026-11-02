/** Native-stack owns detail transitions. No per-screen JS animation/remounts. */
export const DETAIL_STACK_OPTIONS = {
  animation: "slide_from_right",
  gestureEnabled: true,
  headerShown: false,
} as const;
