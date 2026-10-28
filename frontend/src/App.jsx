import { useEffect, useState } from 'react'
import './App.css'
import CategoryManagement from './components/CategoryManagement'


const units = ['each', 'kg', 'liter', 'pack', 'bottle']


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
  const [products, setProducts] = useState([])
const [isLoadingProducts, setIsLoadingProducts] = useState(true)
const [productsError, setProductsError] = useState('')
const [categories, setCategories] = useState([])
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
  async function handleSubmit(event) {
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