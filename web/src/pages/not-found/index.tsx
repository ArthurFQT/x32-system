import { useEffect, useState } from "react";
import styled, { keyframes, css } from "styled-components";
import { theme } from "@/styles/theme";
import { PageContainer, Button } from "@/styles";

// ── Animations ────────────────────────────────────────────

const flicker = keyframes`
  0%, 100% { opacity: 1; }
  92%       { opacity: 1; }
  93%       { opacity: 0.2; }
  94%       { opacity: 1; }
  96%       { opacity: 0.4; }
  97%       { opacity: 1; }
`;

const scanline = keyframes`
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(100vh); }
`;

const blink = keyframes`
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
`;

const glitch = keyframes`
  0%   { clip-path: inset(0 0 98% 0); transform: translate(-4px, 0); }
  10%  { clip-path: inset(40% 0 50% 0); transform: translate(4px, 0); }
  20%  { clip-path: inset(80% 0 5% 0);  transform: translate(-2px, 0); }
  30%  { clip-path: inset(20% 0 70% 0); transform: translate(2px, 0); }
  40%  { clip-path: inset(60% 0 30% 0); transform: translate(-4px, 0); }
  50%  { clip-path: inset(10% 0 85% 0); transform: translate(0, 0); }
  100% { clip-path: inset(0 0 98% 0);   transform: translate(0, 0); }
`;

const vuDrop = keyframes`
  0%   { height: 60%; background: ${theme.colors.accent}; }
  30%  { height: 20%; background: #f0a500; }
  60%  { height: 5%;  background: #cc3333; }
  100% { height: 2%;  background: #444; }
`;

const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 4px rgba(111,183,255,0.2); }
  50%       { box-shadow: 0 0 12px rgba(111,183,255,0.6); }
`;

// ── Layout ────────────────────────────────────────────────

const StyledPage = styled(PageContainer)`
  background: ${theme.colors.bg.primary ?? "#0d0f12"};
  position: relative;
  overflow: hidden;
  flex-direction: column;
  gap: 0;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.15) 2px,
      rgba(0, 0, 0, 0.15) 4px
    );
    pointer-events: none;
    z-index: 1;
  }
`;

const Scanline = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 120px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(111, 183, 255, 0.03),
    transparent
  );
  animation: ${scanline} 8s linear infinite;
  pointer-events: none;
  z-index: 2;
`;

const Content = styled.div`
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.xl};
  max-width: 640px;
  width: 100%;
  padding: ${theme.spacing.lg};
`;

// ── Channel strip (decorative) ─────────────────────────────

const ChannelStrips = styled.div`
  display: flex;
  gap: 6px;
  align-items: flex-end;
  height: 80px;
  opacity: 0.5;
`;

const Strip = styled.div<{ delay: number; dead?: boolean }>`
  width: 18px;
  border-radius: 2px 2px 0 0;
  animation: ${vuDrop} 1.8s ease-out forwards;
  animation-delay: ${(p) => p.delay}ms;
  ${(p) =>
    p.dead &&
    css`
      height: 2px !important;
      background: #333 !important;
      animation: none;
    `}
`;

// ── Code ──────────────────────────────────────────────────

const CodeBlock = styled.div`
  position: relative;
  font-family: "JetBrains Mono", "Fira Code", "Courier New", monospace;

  &::after {
    content: attr(data-text);
    position: absolute;
    top: 0;
    left: 0;
    color: #ff4444;
    animation: ${glitch} 4s steps(1) infinite;
    animation-delay: 2s;
  }
`;

const CodeText = styled.span`
  font-size: clamp(72px, 18vw, 120px);
  font-weight: 900;
  color: ${theme.colors.accent};
  letter-spacing: -4px;
  animation: ${flicker} 6s infinite;
  display: block;
  line-height: 1;
  text-shadow:
    0 0 20px rgba(111, 183, 255, 0.4),
    0 0 60px rgba(111, 183, 255, 0.15);
`;

// ── Status panel ──────────────────────────────────────────

const StatusPanel = styled.div`
  width: 100%;
  border: 1px solid ${theme.colors.border.primary};
  border-radius: ${theme.borderRadius.md};
  background: ${theme.colors.bg.secondary};
  overflow: hidden;
  font-family: "JetBrains Mono", "Fira Code", monospace;
`;

const StatusBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: ${theme.colors.bg.tertiary};
  border-bottom: 1px solid ${theme.colors.border.primary};
  font-size: ${theme.typography.fontSize.xs};
  color: ${theme.colors.text.muted};
`;

const StatusDot = styled.span<{ color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(p) => p.color};
  display: inline-block;
  animation: ${pulse} 2s ease-in-out infinite;
`;

const StatusLine = styled.div<{ delay?: number; dim?: boolean }>`
  padding: ${theme.spacing.xs} ${theme.spacing.md};
  font-size: ${theme.typography.fontSize.xs};
  color: ${(p) =>
    p.dim ? theme.colors.text.muted : theme.colors.text.secondary};
  border-bottom: 1px solid ${theme.colors.border.primary};
  opacity: 0;
  animation: fadeIn 0.3s forwards;
  animation-delay: ${(p) => p.delay ?? 0}ms;

  @keyframes fadeIn {
    to {
      opacity: 1;
    }
  }

  &:last-child {
    border-bottom: none;
  }

  span.ok {
    color: #5dba6e;
  }
  span.err {
    color: #e05555;
  }
  span.warn {
    color: #f0a500;
  }
  span.acc {
    color: ${theme.colors.accent};
  }
`;

const Cursor = styled.span`
  animation: ${blink} 1s step-end infinite;
  color: ${theme.colors.accent};
`;

// ── Message ───────────────────────────────────────────────

const Message = styled.p`
  font-size: ${theme.typography.fontSize.base};
  color: ${theme.colors.text.muted};
  text-align: center;
  margin: 0;
  line-height: 1.6;
  max-width: 400px;
`;

const BackButton = styled(Button)`
  animation: ${pulse} 3s ease-in-out infinite;
`;

// ── Component ─────────────────────────────────────────────

const strips = [0, 1, 2, 3, 4, 5, 6, 7];
const deadAt = [2, 5]; // indexes that are "dead channels"

export function NotFoundPage() {
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setShowCursor((v) => !v), 530);
    return () => clearInterval(t);
  }, []);

  return (
    <StyledPage>
      <Scanline />
      <Content>
        {/* VU meter strips — signal dropping to zero */}
        <ChannelStrips>
          {strips.map((i) => (
            <Strip key={i} delay={i * 80} dead={deadAt.includes(i)} />
          ))}
        </ChannelStrips>

        {/* 404 with glitch */}
        <CodeBlock data-text="404">
          <CodeText>404</CodeText>
        </CodeBlock>

        {/* Terminal-style diagnostics */}
        <StatusPanel>
          <StatusBar>
            <StatusDot color="#e05555" />
            <StatusDot color="#f0a500" />
            <StatusDot color="#333" />
            <span>x32-bridge — diagnóstico de rota</span>
          </StatusBar>

          <StatusLine delay={100}>
            <span className="acc">$</span> route.resolve("
            {window.location.pathname}"
          </StatusLine>
          <StatusLine delay={600}>
            &nbsp;&nbsp;[<span className="err">ERRO</span>] rota não encontrada
            no manifesto
          </StatusLine>
          <StatusLine delay={1100}>
            &nbsp;&nbsp;[<span className="warn">WARN</span>] bridge_signal:{" "}
            <span className="err">NO CARRIER</span>
          </StatusLine>
          <StatusLine delay={1600}>
            &nbsp;&nbsp;[<span className="warn">WARN</span>] channels:{" "}
            <span className="err">0/32 ativos</span>
          </StatusLine>
          <StatusLine delay={2100}>
            &nbsp;&nbsp;[<span className="ok">INFO</span>] sugestão: voltar ao
            painel principal
          </StatusLine>
          <StatusLine delay={2600} dim>
            &nbsp;&nbsp;<Cursor>█</Cursor>
          </StatusLine>
        </StatusPanel>

        <Message>
          Esta rota não existe ou o sinal foi perdido.
          <br />
          Verifique o endereço ou retorne ao início.
        </Message>

        <BackButton type="button" onClick={() => window.history.back()}>
          ← Voltar
        </BackButton>
      </Content>
    </StyledPage>
  );
}
