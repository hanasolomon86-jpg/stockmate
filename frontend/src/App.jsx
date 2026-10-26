import './App.css'

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="StockMate home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>

          <span className="brand-name">StockMate</span>
        </a>

        <span className="header-label">INVENTORY MANAGEMENT</span>
      </header>

      <main className="app-main">
        <section className="welcome-section">
          <p className="eyebrow">YOUR INVENTORY WORKSPACE</p>

          <h1>Welcome to StockMate</h1>

          <p className="welcome-description">
            A simpler way to manage products, monitor stock,
            and keep track of expiration dates.
          </p>
        </section>

        <section
          className="setup-card"
          aria-labelledby="setup-title"
        >
          <div className="setup-icon" aria-hidden="true">
            ✓
          </div>

          <div>
            <h2 id="setup-title">Your workspace is ready</h2>

            <p>
              We are building StockMate step by step.
              Product management is coming first.
            </p>
          </div>
        </section>

        <footer className="app-footer">
          StockMate · Development preview
        </footer>
      </main>
    </div>
  )
}

export default App