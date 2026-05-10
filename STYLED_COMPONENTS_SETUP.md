# Instruções de Instalação de Dependências

Para que o projeto funcione corretamente com os estilos styled-components, você precisa instalar as dependências necessárias:

```bash
npm install styled-components @types/styled-components
```

Ou se usar yarn:

```bash
yarn add styled-components @types/styled-components
```

## O que foi atualizado

1. **Estrutura de estilos** (`src/styles/`):
   - `theme.ts` - Tema centralizado com cores, espaçamento e tipografia
   - `global.ts` - Estilos globais usando createGlobalStyle
   - `components.ts` - Componentes styled reutilizáveis
   - `index.ts` - Exportações centralizadas

2. **Páginas refatoradas**:
   - `HomePage` - Usa componentes PageContainer, Card, Title, List
   - `AdminPage` - Usa componentes admin específicos em `src/pages/admin/styles.ts`
   - `MixPage` - Usa componentes mix específicos em `src/pages/mix/styles.ts`
   - `NotFoundPage` - Usa componentes PageContainer, Card, Title, List

3. **Arquivo removido**:
   - `src/index.css` - Não é mais necessário (substituto por GlobalStyle)

## Estrutura de Componentes Styled

### Componentes Globais (`src/styles/components.ts`):

- **Layouts**: `PageContainer`, `PageContainerTop`, `Card`, `CardWide`, `CardAdmin`
- **Headers**: `Header`, `HeaderActions`, `Title`, `Subtitle`
- **Buttons**: `Button`, `ButtonSmall`
- **Status**: `StatusPill`
- **Alerts**: `AlertMessage`
- **Metadata**: `MetaContainer`, `MetaGrid`, `MetaItem`
- **Channels**: `ChannelsContainer`, `ChannelCard`, `FaderCard`
- **Forms**: `FormGroup`, `FieldLabel`, `TextInput`, `SelectInput`, `FaderInput`
- **Lists**: `List`
- **Sections**: `Section`, `SectionTitle`
- **Grid/Flex**: `FlexRow`, `FlexColumn`, `Grid`
- **Scroll**: `ScrollContainer`

### Componentes Admin (`src/pages/admin/styles.ts`):

- `AdminOverviewGrid` - Grid de métricas
- `AdminForm` - Formulário estilizado
- `FormField`, `FormFieldFull` - Campos de formulário
- `OptionGrid`, `OptionGridSmall`, `OptionGridChannels` - Grids de opções
- `QrPanel` - Painel de QR code
- `TokenActions` - Ações para tokens
- `TableWrapper`, `TokenTable`, `RowActions` - Tabela de tokens
- `LogsContainer` - Container de logs
- `AdminSection` - Seção do painel admin

### Componentes Mix (`src/pages/mix/styles.ts`):

- `BusSelectionContainer` - Seletor de bus
- `BusButton` - Botão de bus
- `ChannelsSection` - Seção de canais
- `ControlCard` - Card de controle
- `ControlHeader`, `ControlTitle` - Cabeçalho do controle
- `ControlGroup` - Grupo de controle
- `ControlLabel` - Rótulo de controle
- `RangeInput` - Input de range estilizado
- `MuteButton` - Botão de mute
- `MixMetaGrid` - Grid de metadados

## Theme

O tema centralizado em `src/styles/theme.ts` inclui:

- **Cores**: bg, text, border, status, link, accent, accentChip, button
- **Espaçamento**: xs, sm, md, lg, xl, xxl
- **Border Radius**: sm, md, lg, pill
- **Transições**: fast, normal, slow
- **Tipografia**: fontFamily, fontSize, fontWeight

## Mobile-first

Todos os componentes são responsive e mobile-first, com media queries quando necessário.
