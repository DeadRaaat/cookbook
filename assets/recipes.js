let recipes = [];
let current = "Все";
let loaded = false;
const grid = document.getElementById("grid");
const search = document.getElementById("search");
const modal = document.getElementById("modal");
const filters = document.getElementById("filters");

function renderCategories(categories) {
  const names = [...new Set([...categories, ...recipes.map(recipe => recipe.cat)])]
    .filter(name => name && name !== "Все");
  filters.replaceChildren();
  ["Все", ...names].forEach(name => {
    const button = element("button", name === current ? "filter active" : "filter", name);
    button.type = "button";
    button.dataset.cat = name;
    button.setAttribute("aria-pressed", String(name === current));
    button.addEventListener("click", () => {
      current = name;
      filters.querySelectorAll("button").forEach(item => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      render();
    });
    filters.append(button);
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function photoUrl(path) {
  if (typeof path !== "string") return "";
  const relative = path.replace(/^\/+/, "");
  if (!relative.startsWith("assets/") || /[\\?#:]/.test(relative)) return "";
  if (relative.split("/").some(part => !part || part === "." || part === "..")) return "";
  return relative.split("/").map(encodeURIComponent).join("/");
}

function recipePhoto(recipe, className, lazy = true) {
  const container = element("div", className);
  const fallback = recipe.emoji || "🍞";
  const url = photoUrl(recipe.image);
  if (!url) {
    container.textContent = fallback;
    return container;
  }
  const image = element("img");
  image.alt = recipe.title;
  image.loading = lazy ? "lazy" : "eager";
  image.src = url;
  image.addEventListener("error", () => {container.textContent = fallback;}, {once: true});
  container.append(image);
  return container;
}

function render() {
  if (!loaded) return;
  const query = search.value.trim().toLocaleLowerCase("ru");
  grid.replaceChildren();
  recipes.forEach((recipe, index) => {
    if ((current !== "Все" && recipe.cat !== current) || !recipe.title.toLocaleLowerCase("ru").includes(query)) return;
    const card = element("article", "card");
    const body = element("div", "card-body");
    const button = element("button", "recipe-btn", "Открыть рецепт →");
    button.type = "button";
    button.addEventListener("click", () => openRecipe(index, button));
    body.append(
      element("div", "tag", recipe.cat),
      element("h3", "", recipe.title),
      element("div", "meta", `⏱ ${recipe.time}`),
      element("p", "desc", recipe.desc),
      button
    );
    card.append(recipePhoto(recipe, "photo"), body);
    grid.append(card);
  });
  if (!grid.childElementCount) grid.append(element("p", "muted", "Рецепты не найдены. Попробуйте другую категорию или название."));
}

let lastRecipeButton;
function openRecipe(index, button) {
  const recipe = recipes[index];
  const content = document.getElementById("modalContent");
  const ingredients = element("ul");
  recipe.ing.forEach(ingredient => ingredients.append(element("li", "", ingredient)));
  content.replaceChildren();
  if (photoUrl(recipe.image)) content.append(recipePhoto(recipe, "recipe-photo", false));
  content.append(
    element("div", "kicker", `${recipe.cat} · ${recipe.time}`),
    element("h2", "", recipe.title),
    element("p", "recipe-text", recipe.desc),
    element("h3", "", "Ингредиенты"),
    ingredients,
    element("h3", "", "Приготовление"),
    element("p", "recipe-text", recipe.steps)
  );
  lastRecipeButton = button;
  modal.classList.add("show");
  document.querySelector(".close").focus();
}

function closeModal() {
  modal.classList.remove("show");
  if (lastRecipeButton) lastRecipeButton.focus();
}

search.addEventListener("input", render);
document.querySelector(".close").addEventListener("click", closeModal);
modal.addEventListener("click", event => {if (event.target === modal) closeModal();});
document.addEventListener("keydown", event => {if (event.key === "Escape") closeModal();});

async function loadRecipes() {
  try {
    const response = await fetch("data/recipes.json", {cache: "no-cache"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.recipes) || !data.recipes.every(recipe =>
      recipe && ["title", "cat", "time", "desc", "steps"].every(key => typeof recipe[key] === "string") &&
      Array.isArray(recipe.ing) && recipe.ing.every(ingredient => typeof ingredient === "string")
    )) throw new Error("Некорректный формат рецептов");
    recipes = data.recipes.map(recipe => ({...recipe, cat: recipe.cat.trim()}));
    let categories = [];
    try {
      const categoryResponse = await fetch("data/categories.json", {cache: "no-cache"});
      if (!categoryResponse.ok) throw new Error(`HTTP ${categoryResponse.status}`);
      const categoryData = await categoryResponse.json();
      if (!Array.isArray(categoryData.categories) || !categoryData.categories.every(category => typeof category?.name === "string")) {
        throw new Error("Некорректный формат категорий");
      }
      categories = categoryData.categories.map(category => category.name.trim());
    } catch (error) {
      // Existing recipes remain accessible even if category settings fail to load.
      console.warn("Категории загружены из рецептов:", error);
    }
    renderCategories(categories);
    loaded = true;
    render();
    document.getElementById("recipes-status").textContent = "";
  } catch (error) {
    console.error("Не удалось загрузить рецепты:", error);
    document.getElementById("recipes-status").textContent = "Не удалось загрузить рецепты. Обновите страницу или попробуйте позже.";
  }
}

loadRecipes();
