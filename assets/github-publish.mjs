const API = "https://api.github.com/repos/DeadRaaat/cookbook";

export class PublishError extends Error {
  constructor(message, code = "request") {super(message); this.code = code;}
}

export function validateRecipe(input) {
  const recipe = {};
  for (const [field, limit] of [["title", 160], ["cat", 100], ["time", 80], ["desc", 2000], ["steps", 30000]]) {
    const value = typeof input[field] === "string" ? input[field].trim() : "";
    if (!value || value.length > limit) throw new PublishError("Заполните все поля рецепта и проверьте длину текста.", "validation");
    recipe[field] = value;
  }
  if (recipe.cat === "Все") throw new PublishError("«Все» — служебное название. Выберите другое название категории.", "validation");
  recipe.ing = (typeof input.ingredients === "string" ? input.ingredients : "").split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  if (!recipe.ing.length || recipe.ing.length > 200 || recipe.ing.some(item => item.length > 1000)) {
    throw new PublishError("Укажите ингредиенты с новой строки (не более 200 пунктов).", "validation");
  }
  recipe.emoji = "🍞";
  return recipe;
}

function base64(bytes) {
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(text);
}

export async function preparePhoto(file) {
  if (!file || !file.size) return null;
  if (file.size > 8 * 1024 * 1024) throw new PublishError("Фото слишком большое. Выберите файл до 8 МБ.", "validation");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let extension;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) extension = "jpg";
  else if ([137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte)) extension = "png";
  else if (String.fromCharCode(...bytes.subarray(0,4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8,12)) === "WEBP") extension = "webp";
  else throw new PublishError("Выберите настоящую фотографию JPG, PNG или WebP.", "validation");
  return {content: base64(bytes), path: `assets/uploads/${crypto.randomUUID()}.${extension}`};
}

export async function publishRecipe({token, input, photo, request = fetch}) {
  if (!/^github_pat_[A-Za-z0-9_]+$/.test(token)) throw new PublishError("Введите fine-grained токен GitHub, начинающийся с github_pat_.", "auth");
  const recipe = validateRecipe(input);
  const image = await preparePhoto(photo);

  async function api(path, method = "GET", body) {
    let response;
    try {
      response = await request(`${API}${path}`, {
        method,
        headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json"},
        body: body ? JSON.stringify(body) : undefined,
        credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(30000)
      });
    } catch {throw new PublishError("Не удалось связаться с GitHub. Проверьте интернет и попробуйте снова.", "network");}
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new PublishError("GitHub не разрешил запись. Проверьте срок токена, репозиторий cookbook и разрешение Contents: Read and write.", "auth");
      if (method === "PATCH" && [409,422].includes(response.status)) throw new PublishError("Коллекция уже изменилась в другой вкладке. Ваш текст сохранён в форме — нажмите «Опубликовать рецепт» ещё раз.", "conflict");
      throw new PublishError(`GitHub не выполнил запрос (${response.status}). Данные в форме не потеряны.`);
    }
    return response.json();
  }

  // Both files and the photo belong to one commit built from one snapshot.
  const branch = await api("/branches/main");
  const head = branch.commit.sha;
  const tree = branch.commit.commit.tree.sha;
  async function readJson(path) {
    const file = await api(`/contents/${path}?ref=${encodeURIComponent(head)}`);
    if (file.encoding !== "base64" || typeof file.content !== "string") throw new PublishError("Не удалось прочитать коллекцию в GitHub.");
    try {
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, "")), char => char.charCodeAt(0))));
    } catch {throw new PublishError("Коллекция в GitHub повреждена. Публикация остановлена, существующие данные не изменены.");}
  }
  const [collection, settings] = await Promise.all([readJson("data/recipes.json"), readJson("data/categories.json")]);
  if (!Array.isArray(collection.recipes) || !Array.isArray(settings.categories)) throw new PublishError("Неизвестный формат коллекции. Существующие рецепты не изменены.");
  if (image) recipe.image = image.path;
  collection.recipes.unshift(recipe);
  const files = [{path:"data/recipes.json", content:JSON.stringify(collection, null, 2) + "\n", encoding:"utf-8"}];
  if (!settings.categories.some(category => category.name?.trim() === recipe.cat)) {
    settings.categories.push({name:recipe.cat});
    files.push({path:"data/categories.json", content:JSON.stringify(settings, null, 2) + "\n", encoding:"utf-8"});
  }
  if (image) files.push({path:image.path, content:image.content, encoding:"base64"});
  const changes = await Promise.all(files.map(async file => {
    const blob = await api("/git/blobs", "POST", {content:file.content, encoding:file.encoding});
    return {path:file.path, mode:"100644", type:"blob", sha:blob.sha};
  }));
  const nextTree = await api("/git/trees", "POST", {base_tree:tree, tree:changes});
  const commit = await api("/git/commits", "POST", {message:`Add recipe: ${recipe.title}`, tree:nextTree.sha, parents:[head]});
  try {
    await api("/git/refs/heads/main", "PATCH", {sha:commit.sha, force:false});
  } catch (error) {
    if (["auth","conflict"].includes(error.code)) throw error;
    // A lost response may still mean the commit was published. Never blindly retry.
    const latest = await api("/branches/main").catch(() => null);
    if (latest?.commit.sha !== commit.sha) throw new PublishError("Не удалось подтвердить публикацию. Перед повторной отправкой проверьте последние коммиты в GitHub, чтобы не добавить рецепт дважды.", "uncertain");
  }
  return {recipe, commit:commit.sha};
}
