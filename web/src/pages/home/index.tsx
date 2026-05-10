import { PageContainer, Card, Title, List } from "@/styles";

export function HomePage() {
  return (
    <PageContainer>
      <Card>
        <Title>X32 Monitor Control</Title>
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
