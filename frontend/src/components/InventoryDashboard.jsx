import { useEffect, useState } from 'react'

async function requestJson(url) {
  const response = await fetch(url)
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Failed to load dashboard data.')
  }

  return result
}

function InventoryDashboard({
  products,
  isLoadingProducts,
  productsError,
  onOpenInventory,
  onEditProduct,
}) {
  const [stockAlerts, setStockAlerts] = useState([])
  const [expiryAlerts, setExpiryAlerts] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true)
  const [dashboardError, setDashboardError] = useState('')

  useEffect(() => {
    let isCurrent = true

    async function loadDashboard() {
      try {
        const [stockData, expiryData, orderData] = await Promise.all([
          requestJson('/api/stock-alerts'),
          requestJson('/api/expiry-alerts?days=7'),
          requestJson('/api/purchase-orders'),
        ])

        if (!isCurrent) return

        setStockAlerts(stockData)
        setExpiryAlerts(expiryData)
        setPurchaseOrders(orderData)
        setDashboardError('')
      } catch (error) {
        console.error('Failed to load dashboard:', error)

        if (isCurrent) {
          setDashboardError(
            'Could not load dashboard data. Please check that the server is running.',
          )
        }
      } finally {
        if (isCurrent) {
          setIsLoadingDashboard(false)
        }
      }
    }

    function refreshDashboard() {
      setIsLoadingDashboard(true)
      loadDashboard()
    }

    window.addEventListener(
      'stockmate:dashboard-refresh',
      refreshDashboard,
    )
    window.addEventListener(
      'stockmate:purchase-orders-updated',
      refreshDashboard,
    )

    loadDashboard()

    return () => {
      isCurrent = false
      window.removeEventListener(
        'stockmate:dashboard-refresh',
        refreshDashboard,
      )
      window.removeEventListener(
        'stockmate:purchase-orders-updated',
        refreshDashboard,
      )
    }
  }, [])

  const openPurchaseOrders = purchaseOrders.filter((order) =>
    ['draft', 'ordered', 'partially_received'].includes(order.status),
  )

  function scrollToSection(sectionId) {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  function handleRefresh() {
    setIsLoadingDashboard(true)
    window.dispatchEvent(new Event('stockmate:dashboard-refresh'))
  }

  function formatDate(date) {
    if (!date) return 'No date'

    return new Date(`${date}T00:00:00`).toLocaleDateString()
  }

  return (
    <section
      className="inventory-dashboard"
      id="inventory-dashboard"
      aria-labelledby="dashboard-title"
    >
      <div className="section-heading">
        <div>
          <h2 id="dashboard-title">Inventory dashboard</h2>
          <p className="field-help">
            A quick overview of your store's inventory.
          </p>
        </div>

        <button
          className="secondary-button"
          type="button"
          onClick={handleRefresh}
          disabled={isLoadingDashboard}
        >
          {isLoadingDashboard ? 'Loading...' : 'Refresh dashboard'}
        </button>
      </div>

      {dashboardError && (
        <p className="form-error management-message" role="alert">
          {dashboardError}
        </p>
      )}

      <div className="dashboard-summary-grid">
        <article className="dashboard-summary-card">
          <h3>Products</h3>
          <p className="dashboard-card-number">
            {isLoadingProducts
              ? '…'
              : productsError
                ? '—'
                : products.length}
          </p>
          <button
            className="text-button"
            type="button"
            onClick={() => scrollToSection('product-catalog')}
          >
            View products
          </button>
        </article>

        <article className="dashboard-summary-card">
          <h3>Low-stock products</h3>
          <p className="dashboard-card-number">
            {isLoadingDashboard ? '…' : stockAlerts.length}
          </p>
          <button
            className="text-button"
            type="button"
            onClick={() => scrollToSection('low-stock-alerts')}
          >
            View stock alerts
          </button>
        </article>

        <article className="dashboard-summary-card">
          <h3>Expiring batches</h3>
          <p className="dashboard-card-number">
            {isLoadingDashboard ? '…' : expiryAlerts.length}
          </p>
          <span className="field-help">Within the next 7 days</span>
        </article>

        <article className="dashboard-summary-card">
          <h3>Open purchase orders</h3>
          <p className="dashboard-card-number">
            {isLoadingDashboard ? '…' : openPurchaseOrders.length}
          </p>
          <button
            className="text-button"
            type="button"
            onClick={() => scrollToSection('purchase-order-management')}
          >
            View purchase orders
          </button>
        </article>
      </div>

      <div className="dashboard-lists-grid">
        <section className="dashboard-list" aria-labelledby="dashboard-low-stock">
          <h3 id="dashboard-low-stock">Low-stock products</h3>

          {isLoadingDashboard ? (
            <p className="empty-state">Loading stock alerts...</p>
          ) : stockAlerts.length === 0 ? (
            <p className="empty-state">No low-stock products right now.</p>
          ) : (
            stockAlerts.slice(0, 5).map((item) => {
              const product = products.find(
                (currentProduct) => currentProduct.id === item.id,
              )

              return (
                <div className="dashboard-list-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      Stock: {item.currentStock} {item.unit}
                      {' · '}
                      Minimum: {item.minStock}
                    </p>
                  </div>

                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!product}
                    onClick={() => product && onEditProduct(product)}
                  >
                    Edit
                  </button>
                </div>
              )
            })
          )}
        </section>

        <section className="dashboard-list" aria-labelledby="dashboard-expiring">
          <h3 id="dashboard-expiring">Upcoming expiration</h3>

          {isLoadingDashboard ? (
            <p className="empty-state">Loading expiration alerts...</p>
          ) : expiryAlerts.length === 0 ? (
            <p className="empty-state">
              No inventory batches expiring within 7 days.
            </p>
          ) : (
            expiryAlerts.slice(0, 5).map((batch) => {
              const product = products.find(
                (currentProduct) => currentProduct.id === batch.productId,
              )

              return (
                <div className="dashboard-list-row" key={batch.batchId}>
                  <div>
                    <strong>{batch.productName}</strong>
                    <p>
                      Expires: {formatDate(batch.expirationDate)}
                      {' · '}
                      {batch.daysUntilExpiration === 0
                        ? 'Today'
                        : `${batch.daysUntilExpiration} day${
                            batch.daysUntilExpiration === 1 ? '' : 's'
                          }`}
                    </p>
                    <p>
                      Remaining: {batch.quantityRemaining} {batch.unit}
                    </p>
                  </div>

                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!product}
                    onClick={() => product && onOpenInventory(product)}
                  >
                    Details
                  </button>
                </div>
              )
            })
          )}
        </section>

        <section className="dashboard-list" aria-labelledby="dashboard-orders">
          <h3 id="dashboard-orders">Open purchase orders</h3>

          {isLoadingDashboard ? (
            <p className="empty-state">Loading purchase orders...</p>
          ) : openPurchaseOrders.length === 0 ? (
            <p className="empty-state">There are no open purchase orders.</p>
          ) : (
            openPurchaseOrders.slice(0, 5).map((order) => (
              <div className="dashboard-list-row" key={order.id}>
                <div>
                  <strong>Order #{order.id}</strong>
                  <p>{order.supplierName}</p>
                  <p>Status: {order.status.replaceAll('_', ' ')}</p>
                </div>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    scrollToSection('purchase-order-management')
                  }
                >
                  View
                </button>
              </div>
            ))
          )}
        </section>
      </div>
    </section>
  )
}

export default InventoryDashboard