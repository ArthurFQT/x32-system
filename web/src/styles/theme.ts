// Tema global com cores e espaçamentos
export const theme = {
  colors: {
    // Background
    bg: {
      primary: "#131313",
      secondary: "#1b1b1b",
      tertiary: "#222",
      gradient:
        "radial-gradient(circle at top, #1f2530, #121212 50%, #0d0d0d 100%)",
      fader: "linear-gradient(160deg, #202834, #1c1c1c 72%)",
    },
    // Text
    text: {
      primary: "#f4f4f4",
      secondary: "#d7d7d7",
      muted: "#c9d4e2",
    },
    // Borders
    border: {
      primary: "#2d2d2d",
      secondary: "#333",
      tertiary: "#4a4a4a",
    },
    // States
    status: {
      connecting: "#7f6000",
      active: "#0e5a2d",
      error: "#722626",
      warning: "#ffd28a",
    },
    // Interactive
    link: "#7cc8ff",
    accent: "#6fb7ff",
    accentChip: {
      bg: "#152235",
      text: "#cfe8ff",
      border: "#4a5f7d",
    },
    button: {
      bg: "#2f2f2f",
      border: "#4a4a4a",
      hover: "#3a3a3a",
    },
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "20px",
    xxl: "24px",
  },
  borderRadius: {
    sm: "8px",
    md: "10px",
    lg: "12px",
    pill: "999px",
  },
  transitions: {
    fast: "0.15s ease-in-out",
    normal: "0.3s ease-in-out",
    slow: "0.5s ease-in-out",
  },
  typography: {
    fontFamily: '"Segoe UI", Arial, sans-serif',
    fontSize: {
      xs: "0.78rem",
      sm: "0.82rem",
      base: "0.95rem",
      lg: "1rem",
      xl: "1.2rem",
    },
    fontWeight: {
      normal: 400,
      semibold: 600,
      bold: 700,
    },
  },
} as const;

export type Theme = typeof theme;
