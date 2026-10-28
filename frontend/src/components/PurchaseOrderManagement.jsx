import { useEffect, useState } from 'react'

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'The request failed.')
  }

  return result
}

const emptyOrderForm = {
  supplierId: '',
  notes: '',
  items: [{ productId: '', quantity: '', unitCost: '' }],
}

function PurchaseOrderManagement() {
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSavingOrder, setIsSavingOrder] = useState(false)
  const [busyOrderId, setBusyOrderId] = useState(null)
  const [orderForm, setOrderForm] = useState(emptyOrderForm)
  const [receivingOrderId, setReceivingOrderId] = useState(null)
  const [receiptItems, setReceiptItems] = useState([])
  const [isReceivingOrder, setIsReceivingOrder] = useState(false)

  useEffect(() => {
    let isCurrent = true

    async function loadInitialData() {
      try {
        const [supplierData, productData, orderData] = await Promise.all([
          requestJson('/api/suppliers'),
          requestJson('/api/products'),
          requestJson('/api/purchase-orders'),
        ])

        if (!isCurrent) return

        setSuppliers(supplierData)
        setProducts(productData)
        setOrders(orderData)
      } catch (error) {
        console.error('Failed to load purchase order data:', error)

        if (isCurrent) {
          setLoadError('Could not load suppliers, products, or orders.')
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false)
        }
      }
    }

    window.addEventListener(
  'stockmate:purchase-orders-updated',
  loadInitialData,
)

loadInitialData()

return () => {
  isCurrent = false
  window.removeEventListener(
    'stockmate:purchase-orders-updated',
    loadInitialData,
  )
}
  }, [])

  async function refreshData() {
    const [supplierData, productData, orderData] = await Promise.all([
      requestJson('/api/suppliers'),
      requestJson('/api/products'),
      requestJson('/api/purchase-orders'),
    ])

    setSuppliers(supplierData)
    setProducts(productData)
    setOrders(orderData)
  }

  function updateOrderItem(index, field, value) {
    setOrderForm((previous) => ({
      ...previous,
      items: previous.items.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, [field]: value }
          : item,
      ),
    }))
  }

  function addOrderItem() {
    setOrderForm((previous) => ({
      ...previous,
      items: [
        ...previous.items,
        { productId: '', quantity: '', unitCost: '' },
      ],
    }))
  }

  function removeOrderItem(index) {
    setOrderForm((previous) => ({
      ...previous,
      items: previous.items.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    }))
  }

  async function handleCreateOrder(event) {
    event.preventDefault()
    setActionError('')
    setSuccessMessage('')

    if (!orderForm.supplierId) {
      setActionError('Please select a supplier.')
      return
    }

    if (orderForm.items.length === 0) {
      setActionError('Add at least one product to the order.')
      return
    }

    const selectedProductIds = orderForm.items.map(
      (item) => item.productId,
    )

    if (selectedProductIds.some((id) => !id)) {
      setActionError('Select a product for every order item.')
      return
    }

    if (new Set(selectedProductIds).size !== selectedProductIds.length) {
      setActionError('Each product can appear only once in an order.')
      return
    }

    const items = []

    for (const item of orderForm.items) {
      const quantity = Number(item.quantity)
      const unitCost = Number(item.unitCost)

      if (
        item.quantity.trim() === '' ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        setActionError('Every ordered quantity must be positive.')
        return
      }

      if (
        item.unitCost.trim() === '' ||
        !Number.isFinite(unitCost) ||
        unitCost < 0
      ) {
        setActionError('Enter a valid non-negative unit cost for every item.')
        return
      }

      items.push({
        productId: Number(item.productId),
        quantity,
        unitCost,
      })
    }

    setIsSavingOrder(true)

    try {
      const order = await requestJson('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: Number(orderForm.supplierId),
          notes: orderForm.notes.trim(),
          items,
        }),
      })

      setOrderForm(emptyOrderForm)
      await refreshData()
      setSuccessMessage(`Purchase order #${order.id} created as a draft.`)
    } catch (error) {
      console.error('Failed to create purchase order:', error)
      setActionError(error.message || 'Could not create purchase order.')
    } finally {
      setIsSavingOrder(false)
    }
  }

  async function updateOrderStatus(order, status) {
    setBusyOrderId(order.id)
    setActionError('')
    setSuccessMessage('')

    try {
      await requestJson(`/api/purchase-orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      await refreshData()
      setSuccessMessage(
        status === 'ordered'
          ? `Purchase order #${order.id} marked as ordered.`
          : `Purchase order #${order.id} cancelled.`,
      )
    } catch (error) {
      console.error('Failed to update purchase order status:', error)
      setActionError(error.message || 'Could not update order status.')
    } finally {
      setBusyOrderId(null)
    }
  }

  function openReceiptForm(order) {
    const outstandingItems = order.items
      .filter((item) => item.remainingQuantity > 0)
      .map((item) => ({
        itemId: item.id,
        productName: item.productName,
        unit: item.unit,
        remainingQuantity: item.remainingQuantity,
        quantity: '',
        expirationDate: '',
      }))

    setReceiptItems(outstandingItems)
    setReceivingOrderId(order.id)
    setActionError('')
    setSuccessMessage('')
  }

  function updateReceiptItem(index, field, value) {
    setReceiptItems((previous) =>
      previous.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, [field]: value }
          : item,
      ),
    )
  }

  async function handleReceiveOrder(event) {
    event.preventDefault()
    setActionError('')
    setSuccessMessage('')

    const items = []

    for (const item of receiptItems) {
      if (item.quantity.trim() === '') {
        continue
      }

      const quantity = Number(item.quantity)

      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        quantity > item.remainingQuantity
      ) {
        setActionError(
          `Enter a positive quantity no greater than ${item.remainingQuantity} for ${item.productName}.`,
        )
        return
      }

      items.push({
        itemId: item.itemId,
        quantity,
        expirationDate: item.expirationDate || null,
      })
    }

    if (items.length === 0) {
      setActionError('Enter a quantity for at least one item to receive.')
      return
    }

    setIsReceivingOrder(true)

    try {
      const order = await requestJson(
        `/api/purchase-orders/${receivingOrderId}/receive`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        },
      )

      setReceivingOrderId(null)
      setReceiptItems([])
      await refreshData()

      setSuccessMessage(
        `Receipt recorded for order #${order.id}. Status: ${order.status.replaceAll('_', ' ')}.`,
      )
    } catch (error) {
      console.error('Failed to receive purchase order:', error)
      setActionError(error.message || 'Could not receive purchase order.')
    } finally {
      setIsReceivingOrder(false)
    }
  }

  function statusLabel(status) {
    return status.replaceAll('_', ' ')
  }

  const activeSuppliers = suppliers.filter(
    (supplier) => Boolean(supplier.isActive),
  )

  return (
    <section className="category-management purchase-order-management">
      <div className="section-heading">
        <h2>Purchase orders</h2>
        <span>{orders.length} orders</span>
      </div>

      {loadError && (
        <p className="form-error management-message" role="alert">
          {loadError}
        </p>
      )}

      {actionError && (
        <p className="form-error management-message" role="alert">
          {actionError}
        </p>
      )}

      {successMessage && (
        <p className="management-success" role="status">
          {successMessage}
        </p>
      )}

      <form className="purchase-order-form" onSubmit={handleCreateOrder}>
        <h3>Create purchase order</h3>

        <div className="management-form-grid">
          <div className="form-field">
            <label htmlFor="purchase-order-supplier">Supplier *</label>
            <select
              id="purchase-order-supplier"
              value={orderForm.supplierId}
              onChange={(event) =>
                setOrderForm((previous) => ({
                  ...previous,
                  supplierId: event.target.value,
                }))
              }
              required
            >
              <option value="">Select a supplier</option>
              {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            {activeSuppliers.length === 0 && (
              <p className="field-help">
                Add or activate a supplier before creating an order.
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="purchase-order-notes">Notes</label>
            <textarea
              id="purchase-order-notes"
              rows={2}
              maxLength={1000}
              value={orderForm.notes}
              onChange={(event) =>
                setOrderForm((previous) => ({
                  ...previous,
                  notes: event.target.value,
                }))
              }
              placeholder="Optional order notes..."
            />
          </div>
        </div>

        <div className="purchase-order-items-editor">
          <div className="purchase-order-subheading">
            <h4>Products in this order</h4>
            <button
              className="secondary-button"
              type="button"
              onClick={addOrderItem}
              disabled={orderForm.items.length >= products.length}
            >
              + Add product
            </button>
          </div>

          {orderForm.items.map((item, index) => {
            const selectedElsewhere = new Set(
              orderForm.items
                .filter((_, itemIndex) => itemIndex !== index)
                .map((orderItem) => orderItem.productId),
            )

            return (
              <div className="purchase-order-item-row" key={index}>
                <div className="form-field">
                  <label htmlFor={`order-product-${index}`}>
                    Product *
                  </label>
                  <select
                    id={`order-product-${index}`}
                    value={item.productId}
                    onChange={(event) =>
                      updateOrderItem(index, 'productId', event.target.value)
                    }
                    required
                  >
                    <option value="">Select a product</option>
                    {products
                      .filter(
                        (product) =>
                          !selectedElsewhere.has(String(product.id)) ||
                          String(product.id) === item.productId,
                      )
                      .map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.unit})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor={`order-quantity-${index}`}>
                    Quantity *
                  </label>
                  <input
                    id={`order-quantity-${index}`}
                    type="number"
                    min="0.001"
                    step="any"
                    value={item.quantity}
                    onChange={(event) =>
                      updateOrderItem(index, 'quantity', event.target.value)
                    }
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor={`order-cost-${index}`}>
                    Unit cost *
                  </label>
                  <input
                    id={`order-cost-${index}`}
                    type="number"
                    min="0"
                    step="any"
                    value={item.unitCost}
                    onChange={(event) =>
                      updateOrderItem(index, 'unitCost', event.target.value)
                    }
                    required
                  />
                </div>

                <div className="purchase-order-item-actions">
                  {orderForm.items.length > 1 && (
                    <button
                      className="text-button delete-button"
                      type="button"
                      onClick={() => removeOrderItem(index)}
                      aria-label={`Remove product row ${index + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="form-actions purchase-order-form-actions">
          <button
            className="primary-button"
            type="submit"
            disabled={
              isSavingOrder ||
              activeSuppliers.length === 0 ||
              products.length === 0
            }
          >
            {isSavingOrder ? 'Saving...' : 'Create draft order'}
          </button>
        </div>
      </form>

      <div className="purchase-order-list-heading">
        <h3>Existing orders</h3>
      </div>

      {isLoading ? (
        <p className="empty-state">Loading purchase orders...</p>
      ) : orders.length === 0 ? (
        <p className="empty-state">No purchase orders created yet.</p>
      ) : (
        <div className="purchase-order-list">
          {orders.map((order) => (
            <article className="purchase-order-card" key={order.id}>
              <div className="purchase-order-card-header">
                <div>
                  <h4>Order #{order.id}</h4>
                  <p>{order.supplierName}</p>
                </div>
                <span className={`order-status order-status-${order.status}`}>
                  {statusLabel(order.status)}
                </span>
              </div>

              {order.notes && (
                <p className="purchase-order-notes">{order.notes}</p>
              )}

              <div className="table-wrapper">
                <table className="product-table">
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">Ordered</th>
                      <th scope="col">Received</th>
                      <th scope="col">Remaining</th>
                      <th scope="col">Unit cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.productName}</td>
                        <td>{item.orderedQuantity}</td>
                        <td>{item.receivedQuantity}</td>
                        <td>{item.remainingQuantity}</td>
                        <td>{item.unitCost.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="purchase-order-card-footer">
                <span className="purchase-order-date">
                  Created: {order.createdAt}
                </span>

                <div className="category-actions">
                  {order.status === 'draft' && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => updateOrderStatus(order, 'ordered')}
                      disabled={busyOrderId === order.id}
                    >
                      {busyOrderId === order.id
                        ? 'Saving...'
                        : 'Mark as ordered'}
                    </button>
                  )}

                  {['ordered', 'partially_received'].includes(order.status) && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => openReceiptForm(order)}
                      disabled={busyOrderId === order.id || isReceivingOrder}
                    >
                      Receive stock
                    </button>
                  )}

                  {['draft', 'ordered'].includes(order.status) && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => updateOrderStatus(order, 'cancelled')}
                      disabled={busyOrderId === order.id}
                    >
                      Cancel order
                    </button>
                  )}
                </div>
              </div>

              {receivingOrderId === order.id && (
                <form
                  className="purchase-receipt-form"
                  onSubmit={handleReceiveOrder}
                >
                  <h4>Receive stock for order #{order.id}</h4>
                  <p className="field-help">
                    Enter the quantity received for each item. Leave an item
                    blank if it is not included in this delivery.
                  </p>

                  {receiptItems.length === 0 ? (
                    <p className="empty-state">
                      No outstanding quantities remain.
                    </p>
                  ) : (
                    receiptItems.map((item, index) => (
                      <div
                        className="purchase-receipt-item"
                        key={item.itemId}
                      >
                        <strong>{item.productName}</strong>
                        <span>
                          Remaining: {item.remainingQuantity} {item.unit}
                        </span>

                        <div className="management-form-grid">
                          <div className="form-field">
                            <label htmlFor={`receipt-quantity-${item.itemId}`}>
                              Quantity received
                            </label>
                            <input
                              id={`receipt-quantity-${item.itemId}`}
                              type="number"
                              min="0.001"
                              max={item.remainingQuantity}
                              step="any"
                              value={item.quantity}
                              onChange={(event) =>
                                updateReceiptItem(
                                  index,
                                  'quantity',
                                  event.target.value,
                                )
                              }
                            />
                          </div>

                          <div className="form-field">
                            <label htmlFor={`receipt-expiry-${item.itemId}`}>
                              Expiration date
                            </label>
                            <input
                              id={`receipt-expiry-${item.itemId}`}
                              type="date"
                              value={item.expirationDate}
                              onChange={(event) =>
                                updateReceiptItem(
                                  index,
                                  'expirationDate',
                                  event.target.value,
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  <div className="form-actions purchase-order-form-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setReceivingOrderId(null)
                        setReceiptItems([])
                        setActionError('')
                      }}
                      disabled={isReceivingOrder}
                    >
                      Close
                    </button>

                    <button
                      className="primary-button"
                      type="submit"
                      disabled={isReceivingOrder || receiptItems.length === 0}
                    >
                      {isReceivingOrder ? 'Saving...' : 'Record receipt'}
                    </button>
                  </div>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default PurchaseOrderManagement