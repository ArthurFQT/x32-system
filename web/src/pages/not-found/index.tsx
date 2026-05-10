import { PageContainer, Card, Title, List } from "@/styles";

export function NotFoundPage() {
  return (
    <PageContainer>
      <Card>
        <Title>Pagina nao encontrada</Title>
        <p>Escolha uma rota:</p>
        <List>
          <li>
            <a href="/admin">/admin</a>
          </li>
          <li>
            <a href="/mix">/mix?token=SEU_TOKEN</a>
          </li>
        </List>
      </Card>
    </PageContainer>
  );
}
