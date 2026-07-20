// Pure search/filter over the full recipe list. The whole collection is
// household-scale, so filtering happens client-side for instant results.
export function filterRecipes(
  recipes,
  { query = '', categoryId = null, tag = null, ingredient = '' } = {},
) {
  const q = query.trim().toLowerCase();
  const ing = ingredient.trim().toLowerCase();
  return recipes.filter((r) => {
    if (categoryId != null && r.category?.id !== categoryId) return false;
    if (tag != null && !(r.tags ?? []).includes(tag)) return false;
    if (ing && !(r.ingredients ?? []).some((line) => line.toLowerCase().includes(ing)))
      return false;
    if (!q) return true;
    const haystack = [r.title, r.summary, ...r.ingredients, ...r.instructions]
      .join('\n')
      .toLowerCase();
    return haystack.includes(q);
  });
}
