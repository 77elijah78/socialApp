import {
  BORDER_RADIUS,
  COLORS,
  SPACING,
  TYPOGRAPHY,
} from "./theme";

/**
 * One appearance for every bottom sheet in the app.
 *
 * Comment sheets are the reference: the sheet itself is the only visible
 * surface. There is no dimming scrim and no drop shadow over the screen
 * behind it, while the transparent press target still dismisses on tap.
 */
export const SHEET_BACKDROP_COLOR = "transparent";
export const SHEET_BACKDROP_OPACITY = 0;

export const SHEET_SURFACE = {
  backgroundColor: COLORS.bgWhite,
  borderTopLeftRadius: BORDER_RADIUS.xxl,
  borderTopRightRadius: BORDER_RADIUS.xxl,
} as const;

export const SHEET_HANDLE = {
  width: 38,
  height: 4,
  borderRadius: BORDER_RADIUS.full,
  alignSelf: "center" as const,
  backgroundColor: "#D9D7E3",
};

export const SHEET_TITLE = {
  color: COLORS.textPrimary,
  fontSize: TYPOGRAPHY.fontSize.xl4,
  fontWeight: TYPOGRAPHY.fontWeight.bold,
} as const;

export const SHEET_PADDING = SPACING.xl;

/** Shared props for @gorhom/bottom-sheet's backdrop. */
export const SHEET_BACKDROP_PROPS = {
  appearsOnIndex: 0,
  disappearsOnIndex: -1,
  opacity: SHEET_BACKDROP_OPACITY,
  pressBehavior: "close",
} as const;
