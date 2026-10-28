import { useEffect, useState } from 'react'
import './App.css'
import CategoryManagement from './components/CategoryManagement'
import SupplierManagement from './components/SupplierManagement'
import PurchaseOrderManagement from './components/PurchaseOrderManagement'
import LowStockAlerts from './components/LowStockAlerts'


const units = ['each', 'kg', 'liter', 'pack', 'bottle']


const emptyForm = {
  name: '',
  category: '',
  unit: '',
  salePrice: '',
  minStock: '',
  targetStock: '',
  preferredSupplierId: '',
  purchaseUnitCost: '',
  barcode: '',
}

function App() {
  const [products, setProducts] = useState([])
  const [inventoryProduct, setInventoryProduct] = useState(null)
const [inventoryBatches, setInventoryBatches] = useState([])
const [inventoryMovements, setInventoryMovements] = useState([])
const [inventoryDispositions, setInventoryDispositions] = useState([])
const [isLoadingDispositions, setIsLoadingDispositions] = useState(false)
const [dispositionsError, setDispositionsError] = useState('')
const [isSavingDisposition, setIsSavingDisposition] = useState(false)

const [dispositionForm, setDispositionForm] = useState({
  batchId: '',
  quantity: '',
  reason: 'expired',
  destination: 'disposal',
})
const [isLoadingMovements, setIsLoadingMovements] = useState(false)
const [movementsError, setMovementsError] = useState('')
const [inventoryForm, setInventoryForm] = useState({
  quantity: '',
  expirationDate: '',
})
const [inventoryError, setInventoryError] = useState('')
const [isLoadingInventory, setIsLoadingInventory] = useState(false)
const [isReceivingInventory, setIsReceivingInventory] = useState(false)
const [isLoadingProducts, setIsLoadingProducts] = useState(true)
const [productsError, setProductsError] = useState('')
const [categories, setCategories] = useState([])
const [suppliers, setSuppliers] = useState([])
const [categoriesError, setCategoriesError] = useState('')
const [editingCategoryId, setEditingCategoryId] = useState(null)
const [editingCategoryName, setEditingCategoryName] = useState('')
const [isUpdatingCategory, setIsUpdatingCategory] = useState(false)
const [deletingCategoryId, setDeletingCategoryId] = useState(null)
const [newCategoryName, setNewCategoryName] = useState('')
const [categoryActionError, setCategoryActionError] = useState('')
const [isSavingCategory, setIsSavingCategory] = useState(false)

useEffect(() => {
  async function loadProducts() {
    try {
      const response = await fetch('/api/products')

      if (!response.ok) {
        throw new Error('Failed to load products.')
      }

      const data = await response.json()
      setProducts(data)
    } catch (error) {
      console.error('Failed to load products:', error)
      setProductsError(
        'Could not load products. Please check that the server is running.',
      )
    } finally {
      setIsLoadingProducts(false)
    }
  }

  loadProducts()
}, [])


useEffect(() => {
  async function loadCategories() {
    try {
      const response = await fetch('/api/categories')

      if (!response.ok) {
        throw new Error('Failed to load categories.')
      }

      const data = await response.json()
      setCategories(data)
    } catch (error) {
      console.error('Failed to load categories:', error)

      setCategoriesError(
        'Could not load categories. Please check that the server is running.',
      )
    }
  }

  loadCategories()
}, [])

useEffect(() => {
  let isCurrent = true

  async function loadSuppliers() {
    try {
      const response = await fetch('/api/suppliers')

      if (!response.ok) {
        throw new Error('Failed to load suppliers.')
      }

      const data = await response.json()

      if (isCurrent) {
        setSuppliers(data)
      }
    } catch (error) {
      console.error('Failed to load suppliers:', error)
    }
  }

  loadSuppliers()

  return () => {
    isCurrent = false
  }
}, [])

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchTerm.trim().toLowerCase())

    const matchesCategory =
      selectedCategory === 'All' ||
      product.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  function openAddForm() {
    setEditingProductId(null)
    setFormData({ ...emptyForm })
    setFormError('')
    setIsFormOpen(true)
  }

  function openEditForm(product) {
    setEditingProductId(product.id)
    setFormData({
      ...product,
      salePrice: String(product.salePrice),
      minStock: String(product.minStock),
      targetStock: String(product.targetStock),
      preferredSupplierId:
  product.preferredSupplierId == null
    ? ''
    : String(product.preferredSupplierId),
purchaseUnitCost: String(product.purchaseUnitCost ?? 0),
      barcode: product.barcode ?? '',
    })
    setFormError('')
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setEditingProductId(null)
    setFormData({ ...emptyForm })
    setFormError('')
  }

  function handleInputChange(event) {
    const { name, value } = event.target

    setFormData((previousData) => ({
      ...previousData,
      [name]: value,
    }))
  }
  async function handleAddCategory(event) {
  event.preventDefault()

  const name = newCategoryName.trim()

  if (!name) {
    setCategoryActionError('Category name is required.')
    return
  }

  if (name.length > 50) {
    setCategoryActionError(
      'Category name cannot exceed 50 characters.',
    )
    return
  }

  setCategoryActionError('')
  setIsSavingCategory(true)

  try {
    const response = await fetch('/api/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to add category.')
    }

    setCategories((previousCategories) =>
      [...previousCategories, result].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    )

    setNewCategoryName('')
  } catch (error) {
    console.error('Failed to add category:', error)
    setCategoryActionError(
      error.message || 'Could not add category. Please try again.',
    )
  } finally {
    setIsSavingCategory(false)
  }
}
function startEditingCategory(category) {
  setEditingCategoryId(category.id)
  setEditingCategoryName(category.name)
  setCategoryActionError('')
}

function cancelEditingCategory() {
  setEditingCategoryId(null)
  setEditingCategoryName('')
  setCategoryActionError('')
}

async function handleUpdateCategory(event) {
  event.preventDefault()

  const name = editingCategoryName.trim()

  if (!name) {
    setCategoryActionError('Category name is required.')
    return
  }

  if (name.length > 50) {
    setCategoryActionError(
      'Category name cannot exceed 50 characters.',
    )
    return
  }

  const previousCategory = categories.find(
    (category) => category.id === editingCategoryId,
  )

  if (!previousCategory) {
    setCategoryActionError('Category not found.')
    return
  }

  setCategoryActionError('')
  setIsUpdatingCategory(true)

  try {
    const response = await fetch(
      `/api/categories/${editingCategoryId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      },
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to update category.')
    }

    setCategories((previousCategories) =>
      previousCategories
        .map((category) =>
          category.id === result.id ? result : category,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    )

    setProducts((previousProducts) =>
      previousProducts.map((product) =>
        product.category === previousCategory.name
          ? { ...product, category: result.name }
          : product,
      ),
    )

    if (selectedCategory === previousCategory.name) {
      setSelectedCategory(result.name)
    }

    cancelEditingCategory()
  } catch (error) {
    console.error('Failed to update category:', error)
    setCategoryActionError(
      error.message || 'Could not update category.',
    )
  } finally {
    setIsUpdatingCategory(false)
  }
}

async function handleDeleteCategory(category) {
  const confirmed = window.confirm(
    `Delete category "${category.name}"? Categories assigned to products cannot be deleted.`,
  )

  if (!confirmed) {
    return
  }

  setCategoryActionError('')
  setDeletingCategoryId(category.id)

  try {
    const response = await fetch(
      `/api/categories/${category.id}`,
      { method: 'DELETE' },
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to delete category.')
    }

    setCategories((previousCategories) =>
      previousCategories.filter(
        (item) => item.id !== category.id,
      ),
    )

    if (selectedCategory === category.name) {
      setSelectedCategory('All')
    }
  } catch (error) {
    console.error('Failed to delete category:', error)
    setCategoryActionError(
      error.message || 'Could not delete category.',
    )
  } finally {
    setDeletingCategoryId(null)
  }
}

async function handleRecordSale(product) {
  const enteredQuantity = window.prompt(
    `Enter quantity sold for ${product.name}:`,
    '1',
  )

  if (enteredQuantity === null) {
    return
  }

  const quantity = Number(enteredQuantity)

  if (
    enteredQuantity.trim() === '' ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    setActionError('Sale quantity must be a positive number.')
    return
  }

  setActionError('')

  try {
    const response = await fetch(`/api/products/${product.id}/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quantity }),
    })

    const result = await response.json()

    if (!response.ok) {
      const availableStock =
        response.status === 409 &&
        typeof result.currentStock === 'number'
          ? ` Available stock: ${result.currentStock}.`
          : ''

      throw new Error(
        `${result.error || 'Failed to record sale.'}${availableStock}`,
      )
    }

    const productsResponse = await fetch('/api/products')

    if (!productsResponse.ok) {
      throw new Error(
        'Sale was recorded, but the product catalog could not refresh. Please refresh the page.',
      )
    }

    const updatedProducts = await productsResponse.json()
    setProducts(updatedProducts)
  } catch (error) {
    console.error('Failed to record sale:', error)
    setActionError(error.message || 'Could not record sale.')
  }
}

async function handleDelete(product) {
  const confirmed = window.confirm(
    `Are you sure you want to delete "${product.name}"?`,
  )

  if (!confirmed) {
    return
  }

  setActionError('')

  try {
    const response = await fetch(`/api/products/${product.id}`, {
      method: 'DELETE',
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to delete product.')
    }

    setProducts((previousProducts) =>
      previousProducts.filter((item) => item.id !== product.id),
    )
  } catch (error) {
    console.error('Failed to delete product:', error)

    setActionError(
      error.message || 'Could not delete product. Please try again.',
    )
  }
}

async function loadInventoryBatches(productId) {
  setIsLoadingInventory(true)
  setInventoryError('')

  try {
    const response = await fetch(
      `/api/products/${productId}/inventory-batches`,
    )
    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to load inventory.')
    }

    setInventoryBatches(result)
  } catch (error) {
    console.error('Failed to load inventory batches:', error)
    setInventoryError('Could not load inventory batches.')
  } finally {
    setIsLoadingInventory(false)
  }
}

async function loadInventoryMovements(productId) {
  setIsLoadingMovements(true)
  setMovementsError('')

  try {
    const response = await fetch(
      `/api/products/${productId}/inventory-movements`,
    )
    const result = await response.json()

    if (!response.ok) {
      throw new Error(
        result.error || 'Failed to load inventory history.',
      )
    }

    setInventoryMovements(result)
  } catch (error) {
    console.error('Failed to load inventory history:', error)
    setMovementsError('Could not load inventory history.')
  } finally {
    setIsLoadingMovements(false)
  }
}

async function loadInventoryDispositions(productId) {
  setIsLoadingDispositions(true)
  setDispositionsError('')

  try {
    const response = await fetch(
      `/api/products/${productId}/inventory-dispositions`,
    )
    const result = await response.json()

    if (!response.ok) {
      throw new Error(
        result.error || 'Failed to load inventory dispositions.',
      )
    }

    setInventoryDispositions(result)
  } catch (error) {
    console.error('Failed to load inventory dispositions:', error)
    setDispositionsError('Could not load expired and damaged stock records.')
  } finally {
    setIsLoadingDispositions(false)
  }
}

async function openInventoryModal(product) {
  setInventoryProduct(product)
  setInventoryBatches([])
  setInventoryMovements([])
  setInventoryDispositions([])
  setMovementsError('')
  setDispositionsError('')

  setInventoryForm({
    quantity: '',
    expirationDate: '',
  })

  setDispositionForm({
    batchId: '',
    quantity: '',
    reason: 'expired',
    destination: 'disposal',
  })

  setInventoryError('')

  await Promise.all([
    loadInventoryBatches(product.id),
    loadInventoryMovements(product.id),
    loadInventoryDispositions(product.id),
  ])
}

async function handleReceiveInventory(event) {
  event.preventDefault()

  if (!inventoryProduct) {
    return
  }

  const quantity = Number(inventoryForm.quantity)

  if (
    inventoryForm.quantity.trim() === '' ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    setInventoryError('Quantity must be a positive number.')
    return
  }

  setInventoryError('')
  setIsReceivingInventory(true)

  try {
    const response = await fetch(
      `/api/products/${inventoryProduct.id}/inventory-batches`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity,
          expirationDate: inventoryForm.expirationDate || null,
        }),
      },
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to receive inventory.')
    }

    setInventoryForm({
  quantity: '',
  expirationDate: '',
})

await loadInventoryBatches(inventoryProduct.id)
await loadInventoryMovements(inventoryProduct.id)
await loadInventoryDispositions(inventoryProduct.id)

// Refresh the product catalog with current inventory totals.
try {
  const productsResponse = await fetch('/api/products')

  if (!productsResponse.ok) {
    throw new Error('Failed to refresh products.')
  }

  const updatedProducts = await productsResponse.json()
  setProducts(updatedProducts)
} catch (refreshError) {
  console.error(
    'Inventory was received, but the product catalog could not refresh:',
    refreshError,
  )

  setActionError(
    'Inventory was received, but the product catalog could not refresh. Please refresh the page.',
  )
}
  } catch (error) {
    console.error('Failed to receive inventory:', error)
    setInventoryError(
      error.message || 'Could not receive inventory.',
    )
  } finally {
    setIsReceivingInventory(false)
  }
}

async function handleDispositionSubmit(event) {
  event.preventDefault()

  if (!inventoryProduct) {
    return
  }

  const quantity = Number(dispositionForm.quantity)

  if (!dispositionForm.batchId) {
    setDispositionsError('Please select an inventory batch.')
    return
  }

  if (
    dispositionForm.quantity.trim() === '' ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    setDispositionsError('Quantity must be a positive number.')
    return
  }

  setDispositionsError('')
  setIsSavingDisposition(true)

  try {
    const response = await fetch(
      `/api/products/${inventoryProduct.id}/inventory-batches/${dispositionForm.batchId}/dispositions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity,
          reason: dispositionForm.reason,
          destination: dispositionForm.destination,
        }),
      },
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(
        result.error || 'Failed to record inventory disposition.',
      )
    }

    setDispositionForm({
      batchId: '',
      quantity: '',
      reason: 'expired',
      destination: 'disposal',
    })

    await Promise.all([
      loadInventoryBatches(inventoryProduct.id),
      loadInventoryMovements(inventoryProduct.id),
      loadInventoryDispositions(inventoryProduct.id),
    ])

    const productsResponse = await fetch('/api/products')

    if (!productsResponse.ok) {
      throw new Error('Disposition was saved, but products could not refresh.')
    }

    setProducts(await productsResponse.json())
  } catch (error) {
    console.error('Failed to record inventory disposition:', error)
    setDispositionsError(
      error.message || 'Could not record inventory disposition.',
    )
  } finally {
    setIsSavingDisposition(false)
  }
}

  async function handleSubmit(event) {
    event.preventDefault()

    const name = formData.name.trim()
    const salePrice = Number(formData.salePrice)
    const minStock = Number(formData.minStock)
    const targetStock = Number(formData.targetStock)
    const purchaseUnitCost = Number(formData.purchaseUnitCost)
    const barcode = formData.barcode.trim()

    if (!name || !formData.category || !formData.unit) {
      setFormError('Please complete all required fields.')
      return
    }

    if (
      formData.salePrice.trim() === '' ||
      !Number.isFinite(salePrice) ||
      salePrice < 0
    ) {
      setFormError('Sale price must be a valid non-negative number.')
      return
    }

    if (
  formData.purchaseUnitCost.trim() === '' ||
  !Number.isFinite(purchaseUnitCost) ||
  purchaseUnitCost < 0
) {
  setFormError('Purchase unit cost must be a non-negative number.')
  return
}

    if (
      formData.minStock.trim() === '' ||
      !Number.isInteger(minStock) ||
      minStock < 0
    ) {
      setFormError('Minimum stock must be a non-negative whole number.')
      return
    }

    if (
      formData.targetStock.trim() === '' ||
      !Number.isInteger(targetStock) ||
      targetStock < 0
    ) {
      setFormError('Target stock must be a non-negative whole number.')
      return
    }

    if (targetStock < minStock) {
      setFormError('Target stock cannot be lower than minimum stock.')
      return
    }

    const barcodeExists =
      barcode !== '' &&
      products.some(
        (product) =>
          product.id !== editingProductId &&
          (product.barcode ?? '').toLowerCase() === barcode.toLowerCase(),
      )

    if (barcodeExists) {
      setFormError('This barcode is already assigned to another product.')
      return
    }

    try {
  const isEditing = editingProductId !== null

  const response = await fetch(
    isEditing
      ? `/api/products/${editingProductId}`
      : '/api/products',
    {
      method: isEditing ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        category: formData.category,
        unit: formData.unit,
        salePrice,
        minStock,
        targetStock,
preferredSupplierId:
  formData.preferredSupplierId === ''
    ? null
    : Number(formData.preferredSupplierId),
purchaseUnitCost,
barcode,
      }),
    },
  )

  const savedProduct = await response.json()

  if (!response.ok) {
    setFormError(
      savedProduct.error || 'Failed to save product.',
    )
    return
  }

  if (isEditing) {
    setProducts((previousProducts) =>
      previousProducts.map((product) =>
        product.id === savedProduct.id
          ? savedProduct
          : product,
      ),
    )
  } else {
    setProducts((previousProducts) => [
      ...previousProducts,
      savedProduct,
    ])
  }

  closeForm()
} catch (error) {
  console.error('Failed to save product:', error)

  setFormError(
    'Could not save product. Please check that the server is running.',
  )
}
  }

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
          <p className="eyebrow">INVENTORY WORKSPACE</p>
          <h1>Products</h1>
          <p className="welcome-description">
            Manage your product catalog, categories, and stock targets.
          </p>
        </section>
        {categoriesError && (
  <p className="form-error" role="alert">
    {categoriesError}
  </p>
)}
        <section className="product-toolbar" aria-label="Product controls">
          <div className="search-field">
            <label htmlFor="product-search">Search products</label>
            <input
              id="product-search"
              type="search"
              placeholder="Enter a product name..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              dir="auto"
            />
          </div>

          <div className="category-field">
            <label htmlFor="category-filter">Category</label>
            <select
              id="category-filter"
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
            >
              <option value="All">All categories</option>
              {categories.map((category) => (
  <option key={category.id} value={category.name}>
    {category.name}
  </option>
))}
            </select>
          </div>

          <button
            className="primary-button"
            type="button"
            onClick={openAddForm}
          >
            + Add product
          </button>
        </section>
       <CategoryManagement
  categories={categories}
  newCategoryName={newCategoryName}
  setNewCategoryName={setNewCategoryName}
  isSavingCategory={isSavingCategory}
  handleAddCategory={handleAddCategory}
  categoryActionError={categoryActionError}
  editingCategoryId={editingCategoryId}
  editingCategoryName={editingCategoryName}
  setEditingCategoryName={setEditingCategoryName}
  isUpdatingCategory={isUpdatingCategory}
  handleUpdateCategory={handleUpdateCategory}
  cancelEditingCategory={cancelEditingCategory}
  startEditingCategory={startEditingCategory}
  deletingCategoryId={deletingCategoryId}
  handleDeleteCategory={handleDeleteCategory}
/>
<SupplierManagement />
<LowStockAlerts />
<PurchaseOrderManagement />
        <section className="product-list-section">
          <div className="section-heading">
            <h2>Product catalog</h2>
            <span>{filteredProducts.length} products</span>
          </div>
          {actionError && (
  <p className="form-error" role="alert">
    {actionError}
  </p>
)}

          {isLoadingProducts ? (
  <p className="empty-state">Loading products...</p>
) : productsError ? (
  <p className="empty-state" role="alert">
    {productsError}
  </p>
) : filteredProducts.length === 0 ? (
  <p className="empty-state">
    No products found. Try a different search or category.
  </p>
) : (
  <div className="table-wrapper">
    <table className="product-table">
      <thead>
        <tr>
          <th scope="col">Product</th>
          <th scope="col">Category</th>
          <th scope="col">Unit</th>
          <th scope="col">Sale price</th>
          <th scope="col">Current stock</th>
          <th scope="col">Min. stock</th>
          <th scope="col">Target stock</th>
          <th scope="col">Barcode</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>

      <tbody>
        {filteredProducts.map((product) => (
          <tr key={product.id}>
            <td className="product-name" dir="auto">
              {product.name}
            </td>
            <td>{product.category}</td>
            <td>{product.unit}</td>
            <td>₪{product.salePrice.toFixed(2)}</td>
            <td>{(product.currentStock ?? 0).toLocaleString()}</td>
            <td>{product.minStock}</td>
            <td>{product.targetStock}</td>
            <td>{product.barcode || '—'}</td>
            <td>
  <button
  className="text-button"
  type="button"
  onClick={() => handleRecordSale(product)}
  aria-label={`Record sale for ${product.name}`}
>
  Record sale
</button>

  <button
    className="text-button"
    type="button"
    onClick={() => openEditForm(product)}
    aria-label={`Edit ${product.name}`}
  >
    Edit
  </button>

<button
  className="text-button"
  type="button"
  onClick={() => openInventoryModal(product)}
  aria-label={`Receive stock for ${product.name}`}
>
  Receive stock
</button>

  <button
    className="text-button delete-button"
    type="button"
    onClick={() => handleDelete(product)}
    aria-label={`Delete ${product.name}`}
  >
    Delete
  </button>
</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
        </section>

{inventoryProduct && (
  <div className="modal-backdrop">
    <section
      className="product-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-modal-title"
    >
      <div className="modal-heading">
        <h2 id="inventory-modal-title">
          Receive stock — {inventoryProduct.name}
        </h2>

        <button
          className="close-button"
          type="button"
          onClick={() => setInventoryProduct(null)}
          aria-label="Close inventory form"
        >
          ×
        </button>
      </div>

      <form onSubmit={handleReceiveInventory}>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="inventory-quantity">
              Quantity received *
            </label>
            <input
              id="inventory-quantity"
              type="number"
              min="0.001"
              step="any"
              required
              value={inventoryForm.quantity}
              onChange={(event) =>
                setInventoryForm((previous) => ({
                  ...previous,
                  quantity: event.target.value,
                }))
              }
            />
          </div>

          <div className="form-field">
            <label htmlFor="inventory-expiration">
              Expiration date
            </label>
            <input
              id="inventory-expiration"
              type="date"
              value={inventoryForm.expirationDate}
              onChange={(event) =>
                setInventoryForm((previous) => ({
                  ...previous,
                  expirationDate: event.target.value,
                }))
              }
            />
          </div>
        </div>

        {inventoryError && (
          <p className="form-error" role="alert">
            {inventoryError}
          </p>
        )}

        <div className="form-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => setInventoryProduct(null)}
          >
            Close
          </button>

          <button
            className="primary-button"
            type="submit"
            disabled={isReceivingInventory}
          >
            {isReceivingInventory ? 'Saving...' : 'Receive stock'}
          </button>
        </div>
      </form>

      <div className="section-heading">
        <h3>Inventory batches</h3>
      </div>

      <p>
        Current available quantity:{' '}
        <strong>
          {inventoryBatches
            .reduce(
              (total, batch) => total + batch.quantityRemaining,
              0,
            )
            .toLocaleString()}
        </strong>
      </p>

      {isLoadingInventory ? (
        <p className="empty-state">Loading inventory...</p>
      ) : inventoryBatches.length === 0 ? (
        <p className="empty-state">
          No inventory has been received for this product yet.
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="product-table">
            <thead>
              <tr>
                <th scope="col">Received</th>
                <th scope="col">Expiration</th>
                <th scope="col">Received quantity</th>
                <th scope="col">Remaining quantity</th>
              </tr>
            </thead>
            <tbody>
              {inventoryBatches.map((batch) => (
                <tr key={batch.id}>
                  <td>{batch.receivedAt}</td>
                  <td>{batch.expirationDate || '—'}</td>
                  <td>{batch.quantityReceived}</td>
                  <td>{batch.quantityRemaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
                </div>
      )}

      <div className="section-heading">
        <h3>Expired and damaged stock</h3>
      </div>

      <form onSubmit={handleDispositionSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="disposition-batch">Inventory batch *</label>
            <select
              id="disposition-batch"
              required
              value={dispositionForm.batchId}
              onChange={(event) =>
                setDispositionForm((previous) => ({
                  ...previous,
                  batchId: event.target.value,
                }))
              }
            >
              <option value="">Select a batch</option>
              {inventoryBatches
                .filter((batch) => batch.quantityRemaining > 0)
                .map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    Expiration: {batch.expirationDate || 'Not specified'} —
                    Available: {batch.quantityRemaining}
                  </option>
                ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="disposition-quantity">Quantity *</label>
            <input
              id="disposition-quantity"
              type="number"
              min="0.001"
              step="any"
              required
              value={dispositionForm.quantity}
              onChange={(event) =>
                setDispositionForm((previous) => ({
                  ...previous,
                  quantity: event.target.value,
                }))
              }
            />
          </div>

          <div className="form-field">
            <label htmlFor="disposition-reason">Reason *</label>
            <select
              id="disposition-reason"
              value={dispositionForm.reason}
              onChange={(event) =>
                setDispositionForm((previous) => ({
                  ...previous,
                  reason: event.target.value,
                }))
              }
            >
              <option value="expired">Expired</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="disposition-destination">Destination *</label>
            <select
              id="disposition-destination"
              value={dispositionForm.destination}
              onChange={(event) =>
                setDispositionForm((previous) => ({
                  ...previous,
                  destination: event.target.value,
                }))
              }
            >
              <option value="returns">Returns</option>
              <option value="disposal">Disposal</option>
            </select>
          </div>
        </div>

        {dispositionsError && (
          <p className="form-error" role="alert">
            {dispositionsError}
          </p>
        )}

        <div className="form-actions">
          <button
            className="primary-button"
            type="submit"
            disabled={
              isSavingDisposition ||
              !inventoryBatches.some(
                (batch) => batch.quantityRemaining > 0,
              )
            }
          >
            {isSavingDisposition ? 'Saving...' : 'Record transfer'}
          </button>
        </div>
      </form>

      <div className="section-heading">
        <h3>Transfer records</h3>
      </div>

      {isLoadingDispositions ? (
        <p className="empty-state">Loading transfer records...</p>
      ) : inventoryDispositions.length === 0 ? (
        <p className="empty-state">
          No expired or damaged stock transfers recorded yet.
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="product-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Reason</th>
                <th scope="col">Destination</th>
                <th scope="col">Quantity</th>
                <th scope="col">Expiration</th>
              </tr>
            </thead>
            <tbody>
              {inventoryDispositions.map((disposition) => (
                <tr key={disposition.id}>
                  <td>{disposition.createdAt}</td>
                  <td>
                    {disposition.reason === 'expired'
                      ? 'Expired'
                      : 'Damaged'}
                  </td>
                  <td>
                    {disposition.destination === 'returns'
                      ? 'Returns'
                      : 'Disposal'}
                  </td>
                  <td>{disposition.quantity}</td>
                  <td>{disposition.expirationDate || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-heading">
        <h3>Inventory history</h3>
      </div>

      {movementsError && (
        <p className="form-error" role="alert">
          {movementsError}
        </p>
      )}

      {isLoadingMovements ? (
        <p className="empty-state">Loading inventory history...</p>
      ) : inventoryMovements.length === 0 ? (
        <p className="empty-state">
          No inventory movements recorded yet.
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="product-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Action</th>
                <th scope="col">Quantity change</th>
                <th scope="col">Expiration</th>
              </tr>
            </thead>
            <tbody>
              {inventoryMovements.map((movement) => (
                <tr key={movement.id}>
                  <td>{movement.createdAt}</td>
                  <td>
                    {movement.movementType === 'received'
  ? 'Stock received'
  : movement.movementType === 'sale'
    ? 'Sale'
    : movement.movementType === 'expired'
      ? 'Expired stock'
      : 'Damaged stock'}
                  </td>
                  <td>
                    {movement.quantityChange > 0 ? '+' : ''}
                    {movement.quantityChange}
                  </td>
                  <td>{movement.expirationDate || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </div>
)}

        {isFormOpen && (
          <div className="modal-backdrop">
            <section
              className="product-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-form-title"
            >
              <div className="modal-heading">
                <h2 id="product-form-title">
                  {editingProductId !== null ? 'Edit product' : 'Add product'}
                </h2>

                <button
                  className="close-button"
                  type="button"
                  onClick={closeForm}
                  aria-label="Close product form"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="form-grid">
                  <div className="form-field">
                    <label htmlFor="product-name">Product name *</label>
                    <input
                      id="product-name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      dir="auto"
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="product-category">Category *</label>
                    <select
                      id="product-category"
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">Select category</option>
                      {categories.map((category) => (
  <option key={category.id} value={category.name}>
    {category.name}
  </option>
))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label htmlFor="product-unit">Unit *</label>
                    <select
                      id="product-unit"
                      name="unit"
                      value={formData.unit}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">Select unit</option>
                      {units.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label htmlFor="product-price">Sale price (₪) *</label>
                    <input
                      id="product-price"
                      name="salePrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.salePrice}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="form-field">
  <label htmlFor="product-purchase-cost">
    Purchase cost per unit (₪) *
  </label>
  <input
    id="product-purchase-cost"
    name="purchaseUnitCost"
    type="number"
    min="0"
    step="0.01"
    value={formData.purchaseUnitCost}
    onChange={handleInputChange}
    required
  />
</div>

<div className="form-field">
  <label htmlFor="product-preferred-supplier">
    Preferred supplier
  </label>
  <select
    id="product-preferred-supplier"
    name="preferredSupplierId"
    value={formData.preferredSupplierId}
    onChange={handleInputChange}
  >
    <option value="">No preferred supplier</option>
    {suppliers.map((supplier) => (
      <option
        key={supplier.id}
        value={String(supplier.id)}
        disabled={!supplier.isActive}
      >
        {supplier.name}
        {supplier.isActive ? '' : ' (Inactive)'}
      </option>
    ))}
  </select>
</div>

                  <div className="form-field">
                    <label htmlFor="product-min-stock">Minimum stock *</label>
                    <input
                      id="product-min-stock"
                      name="minStock"
                      type="number"
                      min="0"
                      step="1"
                      value={formData.minStock}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="product-target-stock">Target stock *</label>
                    <input
                      id="product-target-stock"
                      name="targetStock"
                      type="number"
                      min="0"
                      step="1"
                      value={formData.targetStock}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="form-field form-field-full">
                    <label htmlFor="product-barcode">Barcode (optional)</label>
                    <input
                      id="product-barcode"
                      name="barcode"
                      value={formData.barcode}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                {formError && (
                  <p className="form-error" role="alert">
                    {formError}
                  </p>
                )}

                <div className="form-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={closeForm}
                  >
                    Cancel
                  </button>

                  <button className="primary-button" type="submit">
                    {editingProductId !== null
                      ? 'Save changes'
                      : 'Add product'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        <footer className="app-footer">
          StockMate · Product management
        </footer>
      </main>
    </div>
  )
}

export default App