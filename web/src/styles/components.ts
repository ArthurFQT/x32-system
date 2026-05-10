import styled from "styled-components";
import { theme } from "./theme";

// ============= Layouts =============

export const PageContainer = styled.div`
  min-height: 100vh;
  padding: ${theme.spacing.lg};
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const PageContainerTop = styled(PageContainer)`
  align-items: flex-start;
  padding-top: ${theme.spacing.xl};
`;

export const Card = styled.div`
  width: 100%;
  max-width: 760px;
  background: ${theme.colors.bg.secondary};
  border: 1px solid ${theme.colors.border.primary};
  border-radius: ${theme.borderRadius.lg};
  padding: ${theme.spacing.lg};
`;

export const CardWide = styled(Card)`
  max-width: 860px;
`;

export const CardAdmin = styled(Card)`
  max-width: 1200px;
`;

// ============= Headers =============

export const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.md};
`;

export const HeaderActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
`;

export const Title = styled.h1`
  margin: 0;
  font-size: ${theme.typography.fontSize.xl};
  font-weight: ${theme.typography.fontWeight.bold};
  color: ${theme.colors.text.primary};
`;

export const Subtitle = styled.h2`
  margin: 0 0 ${theme.spacing.md} 0;
  font-size: ${theme.typography.fontSize.lg};
  font-weight: ${theme.typography.fontWeight.semibold};
  color: ${theme.colors.text.primary};
`;

// ============= Buttons =============

export const Button = styled.button`
  border: 1px solid ${theme.colors.button.border};
  background: ${theme.colors.button.bg};
  color: #fff;
  border-radius: ${theme.borderRadius.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-size: ${theme.typography.fontSize.sm};
  font-weight: ${theme.typography.fontWeight.semibold};
  transition:
    background-color ${theme.transitions.fast},
    border-color ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.button.hover};
  }

  &:active {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const ButtonSmall = styled(Button)`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-size: ${theme.typography.fontSize.xs};
`;

// ============= Status Pills =============

export const StatusPill = styled.span<{
  status:
    | "connecting"
    | "active"
    | "error"
    | "expired"
    | "revoked"
    | "invalid"
    | "offline";
}>`
  font-size: ${theme.typography.fontSize.sm};
  font-weight: ${theme.typography.fontWeight.bold};
  padding: ${theme.spacing.xs} ${theme.spacing.md};
  border-radius: ${theme.borderRadius.pill};
  background: ${(props) => {
    switch (props.status) {
      case "connecting":
        return theme.colors.status.connecting;
      case "active":
        return theme.colors.status.active;
      case "expired":
      case "revoked":
      case "invalid":
      case "offline":
      case "error":
        return theme.colors.status.error;
      default:
        return theme.colors.border.tertiary;
    }
  }};
`;

// ============= Alert Messages =============

export const AlertMessage = styled.div<{ type: "error" | "warning" }>`
  margin: ${theme.spacing.md} 0;
  padding: ${theme.spacing.md};
  border-radius: ${theme.borderRadius.md};
  background: ${(props) =>
    props.type === "error"
      ? "rgba(114, 38, 38, 0.3)"
      : "rgba(127, 96, 0, 0.3)"};
  color: ${(props) => (props.type === "error" ? "#ff9f9f" : "#ffd28a")};
  font-weight: ${theme.typography.fontWeight.semibold};
  word-break: break-word;
  font-size: ${theme.typography.fontSize.base};
`;

// ============= Metadata =============

export const MetaContainer = styled.div`
  margin-top: ${theme.spacing.md};
  font-size: ${theme.typography.fontSize.base};
  color: ${theme.colors.text.secondary};
`;

export const MetaGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin-top: ${theme.spacing.md};
`;

export const MetaItem = styled.p`
  margin: 0;
  padding: ${theme.spacing.sm};
  border: 1px solid ${theme.colors.border.primary};
  border-radius: ${theme.borderRadius.sm};
  background: ${theme.colors.bg.tertiary};
  font-size: ${theme.typography.fontSize.base};
  color: ${theme.colors.text.secondary};
`;

export const TextMuted = styled.p`
  margin: 0;
  font-size: ${theme.typography.fontSize.base};
  color: ${theme.colors.text.secondary};
`;

// ============= Channels =============

export const ChannelsContainer = styled.div`
  margin-top: ${theme.spacing.md};
  display: grid;
  gap: ${theme.spacing.md};
`;

export const ChannelCard = styled.div`
  border: 1px solid ${theme.colors.border.secondary};
  border-radius: ${theme.borderRadius.md};
  padding: ${theme.spacing.md};
  background: ${theme.colors.bg.tertiary};
  transition:
    border-color ${theme.transitions.fast},
    background-color ${theme.transitions.fast};

  &:hover {
    border-color: ${theme.colors.border.tertiary};
  }
`;

export const FaderCard = styled(ChannelCard)`
  padding: ${theme.spacing.lg};
  background: ${theme.colors.bg.fader};
`;

export const FaderHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.sm};
`;

export const FaderTitle = styled.h3`
  margin: 0;
  font-size: ${theme.typography.fontSize.lg};
  font-weight: ${theme.typography.fontWeight.semibold};
  color: ${theme.colors.text.primary};
`;

export const ValueChip = styled.span`
  font-size: ${theme.typography.fontSize.xs};
  font-weight: ${theme.typography.fontWeight.bold};
  border: 1px solid ${theme.colors.accentChip.border};
  background: ${theme.colors.accentChip.bg};
  color: ${theme.colors.accentChip.text};
  border-radius: ${theme.borderRadius.pill};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
`;

// ============= Forms =============

export const FormGroup = styled.div`
  margin-bottom: ${theme.spacing.lg};

  &:last-child {
    margin-bottom: 0;
  }
`;

export const FieldLabel = styled.label`
  display: block;
  font-size: ${theme.typography.fontSize.sm};
  color: ${theme.colors.text.muted};
  margin-bottom: ${theme.spacing.sm};
  font-weight: ${theme.typography.fontWeight.semibold};
`;

export const TextInput = styled.input`
  width: 100%;
  padding: ${theme.spacing.md};
  border: 1px solid ${theme.colors.border.primary};
  border-radius: ${theme.borderRadius.sm};
  background: ${theme.colors.bg.tertiary};
  color: ${theme.colors.text.primary};
  font-size: ${theme.typography.fontSize.base};
  transition: border-color ${theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: ${theme.colors.accent};
  }

  &::placeholder {
    color: ${theme.colors.text.muted};
  }
`;

export const SelectInput = styled.select`
  width: 100%;
  padding: ${theme.spacing.md};
  border: 1px solid ${theme.colors.border.primary};
  border-radius: ${theme.borderRadius.sm};
  background: ${theme.colors.bg.tertiary};
  color: ${theme.colors.text.primary};
  font-size: ${theme.typography.fontSize.base};
  transition: border-color ${theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: ${theme.colors.accent};
  }

  option {
    background: ${theme.colors.bg.secondary};
    color: ${theme.colors.text.primary};
  }
`;

export const FaderInput = styled.input<{ percent?: number }>`
  width: 100%;
  margin: 0 0 ${theme.spacing.md};
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
`;

// ============= Lists =============

export const List = styled.ul`
  margin: 0;
  padding-left: ${theme.spacing.lg};
  list-style: disc;

  li {
    margin-bottom: ${theme.spacing.sm};
    color: ${theme.colors.text.secondary};

    a {
      color: ${theme.colors.link};
    }
  }
`;

// ============= Sections =============

export const Section = styled.section`
  margin-bottom: ${theme.spacing.xl};

  &:last-child {
    margin-bottom: 0;
  }
`;

export const SectionTitle = styled.h2`
  font-size: ${theme.typography.fontSize.lg};
  font-weight: ${theme.typography.fontWeight.bold};
  color: ${theme.colors.text.primary};
  margin: 0 0 ${theme.spacing.md} 0;
  border-bottom: 1px solid ${theme.colors.border.primary};
  padding-bottom: ${theme.spacing.md};
`;

// ============= Grid & Flexbox =============

export const FlexRow = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  align-items: center;
  flex-wrap: wrap;
`;

export const FlexColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

export const Grid = styled.div<{ columns?: number }>`
  display: grid;
  grid-template-columns: repeat(
    ${(props) => props.columns || "auto-fit"},
    minmax(250px, 1fr)
  );
  gap: ${theme.spacing.lg};
`;

// ============= Scrollable Container =============

export const ScrollContainer = styled.div`
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid ${theme.colors.border.primary};
  border-radius: ${theme.borderRadius.md};
  padding: ${theme.spacing.md};
  background: ${theme.colors.bg.tertiary};
`;
