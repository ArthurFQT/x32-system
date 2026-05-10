import styled from "styled-components";
import { theme } from "@/styles/theme";
import { Grid, ScrollContainer, ButtonSmall, FlexRow, Section } from "@/styles";

// ── Overview ──────────────────────────────────────────────
// Grid já cobre o layout; só precisamos estilizar os articles filhos
export const AdminOverviewGrid = styled(Grid)`
  margin: ${theme.spacing.lg} 0;

  article {
    background: ${theme.colors.bg.tertiary};
    border: 1px solid ${theme.colors.border.primary};
    border-radius: ${theme.borderRadius.md};
    padding: ${theme.spacing.md};

    h3 {
      margin: 0 0 ${theme.spacing.sm} 0;
      font-size: ${theme.typography.fontSize.sm};
      color: ${theme.colors.text.muted};
      font-weight: ${theme.typography.fontWeight.semibold};
    }

    p {
      margin: 0;
      font-size: ${theme.typography.fontSize.lg};
      font-weight: ${theme.typography.fontWeight.bold};
      color: ${theme.colors.accent};
    }
  }
`;

// ── Section ───────────────────────────────────────────────
// Section global não tem borda/fundo; admin precisa de card visual
export const AdminSection = styled(Section)`
  padding: ${theme.spacing.lg};
  border: 1px solid ${theme.colors.border.primary};
  border-radius: ${theme.borderRadius.md};
  background: ${theme.colors.bg.secondary};
`;

// ── QR Panel ──────────────────────────────────────────────
export const QrPanel = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: ${theme.spacing.lg};
  align-items: center;
  margin: ${theme.spacing.lg} 0;
  padding: ${theme.spacing.lg};
  border: 1px solid ${theme.colors.border.primary};
  border-radius: ${theme.borderRadius.md};
  background: ${theme.colors.bg.tertiary};

  img {
    width: 200px;
    height: 200px;
    border-radius: ${theme.borderRadius.md};
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;

    img {
      width: 100%;
      max-width: 200px;
    }
  }
`;

// ── Token Actions ─────────────────────────────────────────
// FlexRow + ButtonSmall já cobrem tudo; só precisamos do danger variant
export const TokenActions = styled(FlexRow)`
  margin: ${theme.spacing.lg} 0;
`;

export const DangerButton = styled(ButtonSmall)`
  border-color: #722626;
  background: rgba(114, 38, 38, 0.3);
  color: #ff9f9f;

  &:hover:not(:disabled) {
    background: rgba(114, 38, 38, 0.5);
  }
`;

// ── Table ─────────────────────────────────────────────────
// ScrollContainer cobre o wrapper; só precisamos da tabela em si
export const TableWrapper = styled(ScrollContainer)`
  padding: 0;
  max-height: none;
`;

export const TokenTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${theme.typography.fontSize.sm};

  thead {
    background: ${theme.colors.bg.secondary};
    border-bottom: 2px solid ${theme.colors.border.primary};
  }

  th {
    padding: ${theme.spacing.md};
    text-align: left;
    font-weight: ${theme.typography.fontWeight.bold};
    color: ${theme.colors.text.primary};
    border-right: 1px solid ${theme.colors.border.primary};

    &:last-child {
      border-right: none;
    }
  }

  tbody tr {
    border-bottom: 1px solid ${theme.colors.border.primary};

    &:hover {
      background: rgba(111, 183, 255, 0.05);
    }
  }

  td {
    padding: ${theme.spacing.md};
    border-right: 1px solid ${theme.colors.border.primary};
    color: ${theme.colors.text.secondary};

    &:last-child {
      border-right: none;
    }

    small {
      display: block;
      font-size: ${theme.typography.fontSize.xs};
      color: ${theme.colors.text.muted};
      margin-top: ${theme.spacing.xs};
      font-family: monospace;
    }
  }
`;

// Ações dentro de cada linha da tabela
export const RowActions = styled(FlexRow)`
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

export const LogsContainer = styled(ScrollContainer)`
  max-height: 500px;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

// ── Option Grid ───────────────────────────────────────────
// Usado nos checkboxes de BUS e canais
export const OptionGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  margin-top: ${theme.spacing.md};

  label {
    display: flex;
    align-items: center;
    gap: ${theme.spacing.sm};
    padding: ${theme.spacing.md};
    border: 1px solid ${theme.colors.border.primary};
    border-radius: ${theme.borderRadius.md};
    background: ${theme.colors.bg.tertiary};
    cursor: pointer;
    transition: all ${theme.transitions.fast};

    &:hover {
      border-color: ${theme.colors.accent};
      background: rgba(111, 183, 255, 0.05);
    }

    input {
      margin: 0;
      cursor: pointer;

      &:disabled {
        cursor: not-allowed;
      }
    }

    span {
      font-size: ${theme.typography.fontSize.sm};
      color: ${theme.colors.text.secondary};
    }
  }
`;

export const OptionGridSmall = styled(OptionGrid)`
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
`;

export const OptionGridChannels = styled(OptionGrid)`
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
`;
