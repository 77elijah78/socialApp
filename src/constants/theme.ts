// constants/theme.ts
export const COLORS = {
  // Primary
  primary: "#6C5CE7",
  primaryLight: "#A29BFE",
  primaryDark: "#5A4BD1",
  primaryGhost: "rgba(108, 92, 231, 0.08)",
  primaryGhostBorder: "rgba(108, 92, 231, 0.15)",

  // Background
  bgMain: "#F0EFF5",
  bgChat: "#E8E6F0",
  bgWhite: "#FFFFFF",
  bgCard: "#FAFAFF",
  bgInput: "#F5F3FF",

  // Text
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7194",
  textMuted: "#A0A3BD",
  textWhite: "#FFFFFF",
  textOnPrimary: "#FFFFFF",

  // Accent
  online: "#00D26A",
  danger: "#FF4757",
  dangerLight: "#FFF0F0",
  success: "#00D26A",
  successLight: "#E6FFF2",

  // Waveform
  wave1: "#D6D3F0",
  wave2: "#B8B3E8",
  wave3: "#9B93E0",
  wave4: "#7C72D8",
  wave5: "#6C5CE7",

  // Shadows
  shadowPrimary: "rgba(108, 92, 231, 0.25)",
  shadowDark: "rgba(26, 26, 46, 0.08)",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

export const FONT = {
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};

export const SHADOW = {
  sm: {
    shadowColor: COLORS.shadowDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: COLORS.shadowDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: COLORS.shadowPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 8,
  },
  primary: {
    shadowColor: COLORS.shadowPrimary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 6,
  },
};
