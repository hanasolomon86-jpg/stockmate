import { useEffect, useState } from 'react'

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'The request failed.')
  }

  return result
}

function LowStockAlerts() {
  const [alerts, setAlerts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
    const [selectedProductIds, setSelectedProductIds] = useState([])

  useEffect(() => {
    let isCurrent = true

    async function loadInitialAlerts() {
      try {
        const result = await fetchJson('/api/stock-alerts')

        if (isCurrent) {
          setAlerts(result)
        }
      } catch (loadError) {
        console.error('Failed to load stock alerts:', loadError)

        if (isCurrent) {
          setError('Could not load stock alerts. Please try again.')
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false)
        }
      }
    }

    loadInitialAlerts()

    return () => {
      isCurrent = false
    }
  }, [])

  async function refreshAlerts() {
    const result = await fetchJson('/api/stock-alerts')
    setAlerts(result)
  }

  function handleToggleProduct(productId, isSelected) {
    setSelectedProductIds((current) =>
      isSelected
        ? [...new Set([...current, productId])]
        : current.filter((id) => id !== productId),
    )
  }

  async function handleGenerateDrafts() {
    setIsGenerating(true)
    setError('')
    setMessage('')

    try {
     const result = await fetchJson(
  '/api/stock-alerts/generate-drafts',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      productIds: selectedProductIds,
    }),
  },
)

      setMessage(result.message)
      if (result.addedItemCount > 0) {
  setSelectedProductIds([])
}
      await refreshAlerts()

      // Keep the purchase-order section up to date as well.
      window.dispatchEvent(
        new Event('stockmate:purchase-orders-updated'),
      )
    } catch (generationError) {
      console.error('Failed to generate purchase order drafts:', generationError)
      setError(
        generationError.message ||
          'Could not generate purchase order drafts.',
      )

      // The server might have completed the operation before a refresh failed.
      try {
        await refreshAlerts()
      } catch (refreshError) {
        console.error('Failed to refresh stock alerts:', refreshError)
      }
    } finally {
      setIsGenerating(false)
    }
  }

  function getAlertStatus(alert) {
    if (alert.draftAlreadyExists) {
      return 'Draft already exists'
    }

    if (!alert.hasPreferredSupplier) {
      return 'Choose a preferred supplier'
    }

    if (!alert.preferredSupplierActive) {
      return 'Preferred supplier is inactive'
    }

    if (alert.purchaseUnitCost <= 0) {
      return 'Set a purchase cost'
    }

    if (alert.recommendedQuantity <= 0) {
      return 'Incoming stock covers target'
    }

    return 'Ready for draft'
  }

    const eligibleAlerts = alerts.filter(
    (alert) => alert.canGenerateDraft && alert.purchaseUnitCost > 0,
  )

  const eligibleCount = eligibleAlerts.length

  const selectedCount = eligibleAlerts.filter(
    (alert) => selectedProductIds.includes(alert.id),
  ).length

  const allEligibleSelected =
    eligibleCount > 0 && selectedCount === eligibleCount

  return (
    <section className="category-management stock-alerts-management" id="low-stock-alerts">
      <div className="section-heading">
        <h2>Low-stock alerts</h2>
        <span>{alerts.length} alerts</span>
      </div>

      <p className="stock-alerts-description">
        Products at or below their minimum stock level. Recommended order
        quantities account for stock already on the way.
      </p>

      {error && (
        <p className="form-error management-message" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="management-success" role="status">
          {message}
        </p>
      )}

      {isLoading ? (
        <p className="empty-state">Loading stock alerts...</p>
      ) : alerts.length === 0 ? (
        <p className="empty-state">
          No low-stock products right now.
        </p>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="product-table">
              <thead>
                <tr>
                  <th scope="col">
  <input
    type="checkbox"
    aria-label="Select all eligible products"
    checked={allEligibleSelected}
    disabled={eligibleCount === 0}
    onChange={(event) => {
      setSelectedProductIds(
        event.target.checked
          ? eligibleAlerts.map((alert) => alert.id)
          : [],
      )
    }}
  />
</th>
                  <th scope="col">Product</th>
                  <th scope="col">Available</th>
                  <th scope="col">Minimum</th>
                  <th scope="col">Target</th>
                  <th scope="col">Incoming</th>
                  <th scope="col">Recommended order</th>
                  <th scope="col">Preferred supplier</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>

              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
  <input
    type="checkbox"
    aria-label={`Select ${alert.name} for purchase draft`}
    checked={selectedProductIds.includes(alert.id)}
    disabled={!alert.canGenerateDraft || alert.purchaseUnitCost <= 0}
    onChange={(event) =>
      handleToggleProduct(alert.id, event.target.checked)
    }
  />
</td>
                    <td className="product-name">{alert.name}</td>
                    <td>{alert.currentStock} {alert.unit}</td>
                    <td>{alert.minStock}</td>
                    <td>{alert.targetStock}</td>
                    <td>{alert.incomingQuantity}</td>
                    <td>
                      <strong>{alert.recommendedQuantity}</strong>
                    </td>
                    <td>
                      {alert.preferredSupplierName || 'Not selected'}
                    </td>
                    <td>{getAlertStatus(alert)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="stock-alerts-actions">
            <p className="field-help">
              {selectedCount > 0
  ? `${selectedCount} product${selectedCount === 1 ? '' : 's'} selected for draft generation.`
  : eligibleCount > 0
    ? `${eligibleCount} products eligible. Select the products you want to order.`
    : 'To generate drafts, configure an active preferred supplier and a positive purchase cost for each eligible product.'}
            </p>

            <button
              className="primary-button"
              type="button"
              onClick={handleGenerateDrafts}
              disabled={isGenerating || selectedCount === 0}
            >
              {isGenerating ? 'Generating drafts...' : 'Generate purchase drafts'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export default LowStockAlerts