import { useState } from 'react'
import './App.css'

const categories = [
  'Produce',
  'Dairy',
  'Bakery',
  'Pantry',
  'Frozen',
]

const units = ['each', 'kg', 'liter', 'pack', 'bottle']

// Temporary sample data.
// Later, products will be loaded from the SQLite-backed API.
const initialProducts = [
  {
    id: 1,
    name: 'עגבניות',
    category: 'Produce',
    unit: 'kg',
    salePrice: 8.9,
    minStock: 8,
    targetStock: 20,
    barcode: '7290000000012',
  },
  {
    id: 2,
    name: 'חלב 3%',
    category: 'Dairy',
    unit: 'liter',
    salePrice: 7.9,
    minStock: 10,
    targetStock: 30,
    barcode: '7290000000013',
  },
  {
    id: 3,
    name: 'לחם מחיטה מלאה',
    category: 'Bakery',
    unit: 'each',
    salePrice: 9.5,
    minStock: 6,
    targetStock: 18,
    barcode: '',
  },
  {
    id: 4,
    name: 'שמן זית',
    category: 'Pantry',
    unit: 'bottle',
    salePrice: 32.9,
    minStock: 4,
    targetStock: 12,
    barcode: '7290000000014',
  },
]

const emptyForm = {
  name: '',
  category: '',
  unit: '',
  salePrice: '',
  minStock: '',
  targetStock: '',
  barcode: '',
}

function App() {
  const [products, setProducts] = useState(initialProducts)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formError, setFormError] = useState('')

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

  function handleSubmit(event) {
    event.preventDefault()

    const name = formData.name.trim()
    const salePrice = Number(formData.salePrice)
    const minStock = Number(formData.minStock)
    const targetStock = Number(formData.targetStock)
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
          product.barcode.toLowerCase() === barcode.toLowerCase(),
      )

    if (barcodeExists) {
      setFormError('This barcode is already assigned to another product.')
      return
    }

    const savedProduct = {
      id: editingProductId ?? Date.now(),
      name,
      category: formData.category,
      unit: formData.unit,
      salePrice,
      minStock,
      targetStock,
      barcode,
    }

    if (editingProductId !== null) {
      setProducts((previousProducts) =>
        previousProducts.map((product) =>
          product.id === editingProductId ? savedProduct : product,
        ),
      )
    } else {
      setProducts((previousProducts) => [
        ...previousProducts,
        savedProduct,
      ])
    }

    closeForm()
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
                <option key={category} value={category}>
                  {category}
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

        <section className="product-list-section">
          <div className="section-heading">
            <h2>Product catalog</h2>
            <span>{filteredProducts.length} products</span>
          </div>

          {filteredProducts.length === 0 ? (
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
                      <td>{product.minStock}</td>
                      <td>{product.targetStock}</td>
                      <td>{product.barcode || '—'}</td>
                      <td>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => openEditForm(product)}
                          aria-label={`Edit ${product.name}`}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

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
                        <option key={category} value={category}>
                          {category}
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