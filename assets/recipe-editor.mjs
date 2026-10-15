import {publishRecipe, preparePhoto} from "./github-publish.mjs";

const dialog = document.getElementById("recipe-editor");
const form = document.getElementById("recipe-form");
const fields = document.getElementById("recipe-fields");
const status = document.getElementById("editor-status");
const preview = document.getElementById("editor-photo-preview");
const access = document.getElementById("editor-access");
let tokenInMemory = "";
let previewUrl = "";
let publishing = false;
let uncertain = false;
let dirty = false;

function message(text, error = false) {
  status.textContent = text;
  status.toggleAttribute("data-error", error);
}

async function loadCategories() {
  try {
    const response = await fetch("data/categories.json", {cache:"no-cache"});
    if (!response.ok) return;
    const data = await response.json();
    const list = document.getElementById("editor-categories");
    list.replaceChildren();
    data.categories.forEach(category => {
      const option = document.createElement("option");
      option.value = category.name;
      list.append(option);
    });
  } catch { /* A custom category can still be typed when suggestions are offline. */ }
}

document.getElementById("add-recipe").addEventListener("click", () => {
  dialog.showModal();
  form.elements.title.focus();
  loadCategories();
});
function closeEditor() {
  if (publishing) return;
  dialog.close();
}
document.getElementById("editor-close").addEventListener("click", closeEditor);
document.getElementById("editor-cancel").addEventListener("click", closeEditor);
dialog.addEventListener("cancel", event => {if (publishing) event.preventDefault();});
// Closing the popup keeps the draft in the form, but never in persistent storage.
form.addEventListener("input", () => {dirty = true;});
window.addEventListener("beforeunload", event => {
  if (dirty || publishing) {event.preventDefault(); event.returnValue = "";}
});
form.elements.photo.addEventListener("change", async () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  preview.hidden = true;
  preview.removeAttribute("src");
  const file = form.elements.photo.files[0];
  if (!file) return;
  try {
    await preparePhoto(file);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.hidden = false;
    message("");
  } catch (error) {
    form.elements.photo.value = "";
    message(error.message, true);
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (publishing || uncertain) return;
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (!local && location.protocol !== "https:") return message("Для безопасной публикации откройте сайт по HTTPS.", true);
  const data = new FormData(form);
  const token = String(data.get("token") || "").trim() || tokenInMemory;
  form.elements.token.value = "";
  publishing = true;
  fields.disabled = true;
  document.getElementById("editor-close").disabled = true;
  message("Сохраняем рецепт и фотографию в GitHub… Не закрывайте эту вкладку.");
  try {
    const result = await publishRecipe({token, input:Object.fromEntries(data), photo:form.elements.photo.files[0]});
    tokenInMemory = token;
    // The saved recipe is visible to its author now; deployment updates it for everyone.
    window.dispatchEvent(new CustomEvent("recipe-published", {detail:{recipe:result.recipe, previewUrl}}));
    previewUrl = ""; // The recipe card now owns this object URL until the page unloads.
    form.reset();
    preview.hidden = true;
    preview.removeAttribute("src");
    form.elements.token.required = false;
    access.open = false;
    document.getElementById("editor-token-hint").textContent = "Токен уже принят для этой вкладки. Для следующего рецепта вводить его заново не нужно. После обновления страницы потребуется войти снова.";
    dirty = false;
    message("Рецепт опубликован в GitHub и добавлен в вашу коллекцию на этой странице. Для остальных посетителей он появится через несколько минут, после автоматического обновления сайта.");
  } catch (error) {
    if (error.code === "auth") {
      tokenInMemory = "";
      form.elements.token.required = true;
      access.open = true;
    }
    uncertain = error.code === "uncertain";
    message(error.message || "Не удалось сохранить рецепт. Ваш текст остался в форме.", true);
  } finally {
    publishing = false;
    fields.disabled = uncertain;
    document.getElementById("editor-close").disabled = false;
  }
});
