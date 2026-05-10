export function HomePage() {
  return (
    <div className="page">
      <main className="card home-card">
        <h1>X32 Monitor Control</h1>
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
