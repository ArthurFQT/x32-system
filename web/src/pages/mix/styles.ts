import styled from "styled-components";
import { theme } from "@/styles/theme";

// ============= Bus Selection =============

export const BusSelectionContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: ${theme.spacing.md};
  margin: ${theme.spacing.lg} 0;
`;

export const BusButton = styled.button<{ isActive?: boolean }>`
  padding: ${theme.spacing.md};
  border: 2px solid
    ${(props) =>
      props.isActive ? theme.colors.accent : theme.colors.border.tertiary};
  background: ${(props) =>
    props.isActive ? "rgba(111, 183, 255, 0.1)" : theme.colors.button.bg};
  color: ${(props) =>
    props.isActive ? theme.colors.accent : theme.colors.text.primary};
  border-radius: ${theme.borderRadius.md};
  font-weight: ${theme.typography.fontWeight.bold};
  font-size: ${theme.typography.fontSize.base};
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover:not(:disabled) {
    border-color: ${theme.colors.accent};
    background: rgba(111, 183, 255, 0.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ============= Channels Section =============

export const ChannelsSection = styled.section<{ disabled?: boolean }>`
  margin-top: ${theme.spacing.xl};
  display: grid;
  gap: ${theme.spacing.lg};
  opacity: ${(props) => (props.disabled ? 0.6 : 1)};
  pointer-events: ${(props) => (props.disabled ? "none" : "auto")};
`;

// ============= Control Card =============

export const ControlCard = styled.article`
  border: 1px solid ${theme.colors.border.secondary};
  border-radius: ${theme.borderRadius.md};
  padding: ${theme.spacing.lg};
  background: ${theme.colors.bg.fader};
  transition: all ${theme.transitions.fast};

  &:hover {
    border-color: ${theme.colors.border.tertiary};
  }
`;

// ============= Control Header =============

export const ControlHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.lg};
  gap: ${theme.spacing.md};
`;

export const ControlTitle = styled.h2`
  margin: 0;
  font-size: ${theme.typography.fontSize.lg};
  font-weight: ${theme.typography.fontWeight.bold};
  color: ${theme.colors.text.primary};
`;

// ============= Control Group =============

export const ControlGroup = styled.div`
  margin-bottom: ${theme.spacing.lg};

  &:last-of-type {
    margin-bottom: 0;
  }
`;

export const ControlLabel = styled.label`
  display: block;
  font-size: ${theme.typography.fontSize.sm};
  color: ${theme.colors.text.muted};
  margin-bottom: ${theme.spacing.sm};
  font-weight: ${theme.typography.fontWeight.semibold};
`;

// ============= Range Input (Fader) =============

export const RangeInput = styled.input<{ percent?: number }>`
  width: 100%;
  height: 8px;
  border-radius: ${theme.borderRadius.pill};
  appearance: none;
  background: ${(props) =>
    props.percent !== undefined
      ? `linear-gradient(90deg, ${theme.colors.accent} 0%, ${theme.colors.accent} ${props.percent}%, ${theme.colors.border.tertiary} ${props.percent}%, ${theme.colors.border.tertiary} 100%)`
      : theme.colors.border.tertiary};
  outline: none;
  transition: background ${theme.transitions.fast};
  cursor: pointer;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: ${theme.colors.accent};
    border: none;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(111, 183, 255, 0.4);
    transition: box-shadow ${theme.transitions.fast};

    &:hover {
      box-shadow: 0 0 12px rgba(111, 183, 255, 0.6);
    }
  }

  &::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: ${theme.colors.accent};
    border: none;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(111, 183, 255, 0.4);
    transition: box-shadow ${theme.transitions.fast};

    &:hover {
      box-shadow: 0 0 12px rgba(111, 183, 255, 0.6);
    }
  }

  &::-webkit-slider-runnable-track {
    background: transparent;
    border: none;
  }

  &::-moz-range-track {
    background: transparent;
    border: none;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ============= Control Buttons =============

export const MuteButton = styled.button<{ muted?: boolean }>`
  width: 100%;
  padding: ${theme.spacing.md};
  margin-top: ${theme.spacing.md};
  border: 2px solid
    ${(props) => (props.muted ? "#722626" : theme.colors.border.tertiary)};
  background: ${(props) =>
    props.muted ? "rgba(114, 38, 38, 0.3)" : theme.colors.button.bg};
  color: ${(props) => (props.muted ? "#ff9f9f" : theme.colors.text.primary)};
  border-radius: ${theme.borderRadius.md};
  font-weight: ${theme.typography.fontWeight.bold};
  font-size: ${theme.typography.fontSize.base};
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover:not(:disabled) {
    border-color: ${theme.colors.accent};
    background: rgba(111, 183, 255, 0.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ============= Meta Info =============

export const MixMetaGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  margin: ${theme.spacing.lg} 0;

  p {
    margin: 0;
    padding: ${theme.spacing.md};
    border: 1px solid ${theme.colors.border.primary};
    border-radius: ${theme.borderRadius.md};
    background: ${theme.colors.bg.tertiary};
    font-size: ${theme.typography.fontSize.base};
    color: ${theme.colors.text.secondary};

    strong {
      color: ${theme.colors.text.primary};
    }
  }
`;
