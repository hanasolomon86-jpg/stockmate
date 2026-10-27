
function CategoryManagement({
  categories,
  newCategoryName,
  setNewCategoryName,
  isSavingCategory,
  handleAddCategory,
  categoryActionError,
  editingCategoryId,
  editingCategoryName,
  setEditingCategoryName,
  isUpdatingCategory,
  handleUpdateCategory,
  cancelEditingCategory,
  startEditingCategory,
  deletingCategoryId,
  handleDeleteCategory,
}) {
  return (
    <section className="category-management">
      <div className="section-heading">
        <h2>Manage categories</h2>
        <span>{categories.length} categories</span>
      </div>

      <form
        className="category-add-form"
        onSubmit={handleAddCategory}
      >
        <div className="form-field">
          <label htmlFor="new-category-name">
            New category name
          </label>

          <input
            id="new-category-name"
            type="text"
            value={newCategoryName}
            onChange={(event) =>
              setNewCategoryName(event.target.value)
            }
            placeholder="Enter a category name..."
            maxLength={50}
            required
          />
        </div>

        <button
          className="primary-button"
          type="submit"
          disabled={isSavingCategory}
        >
          {isSavingCategory ? 'Saving...' : '+ Add category'}
        </button>
      </form>

      {categoryActionError && (
        <p className="form-error" role="alert">
          {categoryActionError}
        </p>
      )}

      <div className="category-list">
        {categories.map((category) => (
          <div className="category-row" key={category.id}>
            {editingCategoryId === category.id ? (
              <form
                className="category-edit-form"
                onSubmit={handleUpdateCategory}
              >
                <div className="form-field">
                  <label htmlFor={`edit-category-${category.id}`}>
                    Category name
                  </label>

                  <input
                    id={`edit-category-${category.id}`}
                    type="text"
                    value={editingCategoryName}
                    onChange={(event) =>
                      setEditingCategoryName(event.target.value)
                    }
                    maxLength={50}
                    required
                  />
                </div>

                <div className="category-actions">
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={isUpdatingCategory}
                  >
                    {isUpdatingCategory
                      ? 'Saving...'
                      : 'Save changes'}
                  </button>

                  <button
                    className="secondary-button"
                    type="button"
                    onClick={cancelEditingCategory}
                    disabled={isUpdatingCategory}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <span className="category-name">
                  {category.name}
                </span>

                <div className="category-actions">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => startEditingCategory(category)}
                  >
                    Edit
                  </button>

                  <button
                    className="text-button delete-button"
                    type="button"
                    onClick={() => handleDeleteCategory(category)}
                    disabled={deletingCategoryId === category.id}
                  >
                    {deletingCategoryId === category.id
                      ? 'Deleting...'
                      : 'Delete'}
                  </button>
                </div>
              </>

            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default CategoryManagement;
