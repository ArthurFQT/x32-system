
export function NotFoundPage() {
  return (
    <div className="page">
      <main className="card home-card">
        <h1>Pagina nao encontrada</h1>
        <p>Escolha uma rota:</p>
        <ul>
          <li>
            <a href="/admin">/admin</a>
          </li>
          <li>
            <a href="/mix">/mix?token=SEU_TOKEN</a>
          </li>
        </ul>
      </main>
    </div>
  );
}
