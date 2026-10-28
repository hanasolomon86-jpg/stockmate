import { useCallback, useEffect, useState } from 'react'

const emptySupplierForm = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  notes: '',
}

function SupplierManagement() {
  const [suppliers, setSuppliers] = useState([])
  const [form, setForm] = useState(emptySupplierForm)
  const [editingSupplierId, setEditingSupplierId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [savingSupplierId, setSavingSupplierId] = useState(null)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')

  const loadSuppliers = useCallback(async () => {

    try {
      const response = await fetch('/api/suppliers')
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load suppliers.')
      }

      setSuppliers(result)
    } catch (loadError) {
      console.error('Failed to load suppliers:', loadError)
      setError('Could not load suppliers. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
  let isCurrent = true

  async function fetchInitialSuppliers() {
    try {
      const response = await fetch('/api/suppliers')
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load suppliers.')
      }

      if (isCurrent) {
        setSuppliers(result)
      }
    } catch (loadError) {
      console.error('Failed to load suppliers:', loadError)

      if (isCurrent) {
        setError('Could not load suppliers. Please try again.')
      }
    } finally {
      if (isCurrent) {
        setIsLoading(false)
      }
    }
  }

  fetchInitialSuppliers()

  return () => {
    isCurrent = false
  }
}, [])

  function resetForm() {
    setForm(emptySupplierForm)
    setEditingSupplierId(null)
    setFormError('')
  }

  function startEditing(supplier) {
    setEditingSupplierId(supplier.id)
    setForm({
      name: supplier.name,
      contactName: supplier.contactName || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      notes: supplier.notes || '',
    })
    setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const name = form.name.trim()

    if (!name) {
      setFormError('Supplier name is required.')
      return
    }

    setIsSaving(true)
    setFormError('')

    try {
      const existingSupplier = suppliers.find(
        (supplier) => supplier.id === editingSupplierId,
      )

      const body = {
        name,
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        notes: form.notes.trim(),
      }

      if (editingSupplierId !== null) {
        body.isActive = existingSupplier?.isActive ?? 1
      }

      const response = await fetch(
        editingSupplierId === null
          ? '/api/suppliers'
          : `/api/suppliers/${editingSupplierId}`,
        {
          method: editingSupplierId === null ? 'POST' : 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save supplier.')
      }

      resetForm()
      await loadSuppliers()
    } catch (saveError) {
      console.error('Failed to save supplier:', saveError)
      setFormError(
        saveError.message || 'Could not save supplier.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleSupplierStatus(supplier) {
    setSavingSupplierId(supplier.id)
    setError('')

    try {
      const response = await fetch(
        `/api/suppliers/${supplier.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: supplier.name,
            contactName: supplier.contactName || '',
            phone: supplier.phone || '',
            email: supplier.email || '',
            notes: supplier.notes || '',
            isActive: !supplier.isActive,
          }),
        },
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update supplier.')
      }

      await loadSuppliers()
    } catch (updateError) {
      console.error('Failed to update supplier status:', updateError)
      setError('Could not update supplier status. Please try again.')
    } finally {
      setSavingSupplierId(null)
    }
  }

  return (
    <section className="category-management supplier-management">
      <div className="section-heading">
        <h2>Manage suppliers</h2>
        <span>{suppliers.length} suppliers</span>
      </div>

      <form className="supplier-form" onSubmit={handleSubmit}>
        <div className="management-form-grid">
          <div className="form-field">
            <label htmlFor="supplier-name">Supplier name *</label>
            <input
              id="supplier-name"
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
              }
              maxLength={100}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="supplier-contact">Contact name</label>
            <input
              id="supplier-contact"
              type="text"
              value={form.contactName}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  contactName: event.target.value,
                }))
              }
              maxLength={100}
            />
          </div>

          <div className="form-field">
            <label htmlFor="supplier-phone">Phone</label>
            <input
              id="supplier-phone"
              type="tel"
              value={form.phone}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  phone: event.target.value,
                }))
              }
              maxLength={30}
            />
          </div>

          <div className="form-field">
            <label htmlFor="supplier-email">Email</label>
            <input
              id="supplier-email"
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  email: event.target.value,
                }))
              }
              maxLength={254}
            />
          </div>

          <div className="form-field supplier-notes-field">
            <label htmlFor="supplier-notes">Notes</label>
            <textarea
              id="supplier-notes"
              value={form.notes}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  notes: event.target.value,
                }))
              }
              maxLength={1000}
              rows={3}
            />
          </div>
        </div>

        {formError && (
          <p className="form-error supplier-form-error" role="alert">
            {formError}
          </p>
        )}

        <div className="form-actions supplier-form-actions">
          {editingSupplierId !== null && (
            <button
              className="secondary-button"
              type="button"
              onClick={resetForm}
              disabled={isSaving}
            >
              Cancel
            </button>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={isSaving}
          >
            {isSaving
              ? 'Saving...'
              : editingSupplierId === null
                ? '+ Add supplier'
                : 'Save changes'}
          </button>
        </div>
      </form>

      {error && (
        <p className="form-error supplier-form-error" role="alert">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="empty-state">Loading suppliers...</p>
      ) : suppliers.length === 0 ? (
        <p className="empty-state">
          No suppliers added yet. Add your first supplier above.
        </p>
      ) : (
        <div className="category-list supplier-list">
          {suppliers.map((supplier) => (
            <div className="category-row supplier-row" key={supplier.id}>
              <div className="supplier-details">
                <span className="category-name">
                  {supplier.name}
                </span>

                <p className="supplier-meta">
                  {supplier.contactName || 'No contact name'}
                  {supplier.phone ? ` · ${supplier.phone}` : ''}
                  {supplier.email ? ` · ${supplier.email}` : ''}
                </p>

                <span
                  className={`supplier-status ${
                    supplier.isActive
                      ? 'supplier-status-active'
                      : 'supplier-status-inactive'
                  }`}
                >
                  {supplier.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="category-actions">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => startEditing(supplier)}
                  disabled={isSaving || savingSupplierId !== null}
                >
                  Edit
                </button>

                <button
                  className="text-button"
                  type="button"
                  onClick={() => toggleSupplierStatus(supplier)}
                  disabled={
                    isSaving || savingSupplierId !== null
                  }
                >
                  {savingSupplierId === supplier.id
                    ? 'Saving...'
                    : supplier.isActive
                      ? 'Deactivate'
                      : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default SupplierManagement