import { createGlobalStyle } from "styled-components";
import { theme } from "./theme";

export const GlobalStyle = createGlobalStyle`
  * {
    box-sizing: border-box;
  }

  html, body, #root {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
  }

  body {
    font-family: ${theme.typography.fontFamily};
    color: ${theme.colors.text.primary};
    background: ${theme.colors.bg.primary};
    min-height: 100vh;
    background: ${theme.colors.bg.gradient};
    margin: 0;
  }

  a {
    color: ${theme.colors.link};
    text-decoration: none;
    transition: color ${theme.transitions.fast};

    &:hover {
      color: ${theme.colors.accent};
    }
  }

  button {
    font-family: inherit;
    cursor: pointer;
  }

  input, select, textarea {
    font-family: inherit;
  }

  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: ${theme.colors.bg.secondary};
  }

  ::-webkit-scrollbar-thumb {
    background: ${theme.colors.border.tertiary};
    border-radius: ${theme.borderRadius.sm};

    &:hover {
      background: #5a5a5a;
    }
  }
`;
