import assert from "node:assert/strict";
import {test} from "node:test";
import {publishRecipe, validateRecipe, preparePhoto} from "../assets/github-publish.mjs";

const input = {title:"Мой хлеб",cat:"Хлеб",time:"1 час",desc:"Хрустящая корочка",ingredients:" 500 г муки\n\n350 мл воды ",steps:"Замесить тесто.\nИспечь."};
function github({conflict = false, lostResponse = false, readOnly = false} = {}) {
  const calls = [];
  let updated = false;
  const request = async (url, options) => {
    const path = new URL(url).pathname.replace("/repos/DeadRaaat/cookbook", "");
    const body = options.body && JSON.parse(options.body);
    calls.push({path, method:options.method, body});
    const json = data => new Response(JSON.stringify(data));
    if (path === "/branches/main") return json({commit:{sha:updated ? "new-commit" : "head", commit:{tree:{sha:"base-tree"}}}});
    if (path.startsWith("/contents/")) {
      const data = path.includes("categories") ? {categories:[{name:"Хлеб"}]} : {recipes:[{title:"Существующий рецепт"}]};
      assert.equal(new URL(url).searchParams.get("ref"), "head");
      return json({encoding:"base64",content:Buffer.from(JSON.stringify(data)).toString("base64")});
    }
    if (readOnly) return new Response("", {status:403});
    if (path === "/git/blobs") return json({sha:"blob"});
    if (path === "/git/trees") {assert.equal(body.base_tree,"base-tree"); return json({sha:"new-tree"});}
    if (path === "/git/commits") {assert.deepEqual(body.parents,["head"]); return json({sha:"new-commit"});}
    if (path === "/git/refs/heads/main") {
      assert.equal(body.force,false);
      if (conflict) return new Response("", {status:422});
      updated = true;
      if (lostResponse) throw new Error("Connection lost");
      return json({object:{sha:"new-commit"}});
    }
    throw new Error(`Unexpected request ${path}`);
  };
  return {request,calls};
}

test("ingredients and multiline steps are preserved", () => {
  const recipe = validateRecipe(input);
  assert.deepEqual(recipe.ing,["500 г муки","350 мл воды"]);
  assert.equal(recipe.steps,input.steps);
});
test("blank fields and reserved categories are rejected", () => {
  for (const patch of [{title:" "},{cat:"Все"},{ingredients:"\n"}]) assert.throws(()=>validateRecipe({...input,...patch}));
});
test("cooking time is optional", () => {
  const {time, ...withoutTime} = input;
  assert.equal(validateRecipe(withoutTime).time, "");
  for (const time of ["", "   "]) assert.equal(validateRecipe({...input, time}).time, "");
  assert.throws(() => validateRecipe({...input, time:"x".repeat(81)}));
});
test("recipe publication preserves existing entries and uses a non-forced atomic commit", async () => {
  const mock = github();
  const result = await publishRecipe({token:"github_pat_test",input,request:mock.request});
  assert.equal(result.commit,"new-commit");
  const saved = JSON.parse(mock.calls.find(call=>call.path==="/git/blobs").body.content);
  assert.equal(saved.recipes.length,2);
  assert.equal(saved.recipes[1].title,"Существующий рецепт");
  assert.equal(JSON.stringify(saved).includes("github_pat_"),false);
});
test("a new category is saved in the same tree as its recipe", async () => {
  const mock = github();
  await publishRecipe({token:"github_pat_test",input:{...input,cat:"Пироги"},request:mock.request});
  const paths = mock.calls.find(call=>call.path==="/git/trees").body.tree.map(file=>file.path);
  assert.deepEqual(paths,["data/recipes.json","data/categories.json"]);
});
test("conflicting concurrent changes are not overwritten", async () => {
  const mock = github({conflict:true});
  await assert.rejects(()=>publishRecipe({token:"github_pat_test",input,request:mock.request}), error=>error.code==="conflict");
});
test("a lost success response is confirmed without a duplicate commit", async () => {
  const mock = github({lostResponse:true});
  const result = await publishRecipe({token:"github_pat_test",input,request:mock.request});
  assert.equal(result.commit,"new-commit");
  assert.equal(mock.calls.filter(call=>call.path==="/git/commits").length,1);
});
test("a read-only token does not publish anything", async () => {
  const mock = github({readOnly:true});
  await assert.rejects(()=>publishRecipe({token:"github_pat_test",input,request:mock.request}), error=>error.code==="auth");
  assert.equal(mock.calls.some(call=>call.path==="/git/refs/heads/main"),false);
});
test("oversized and unsupported photos are rejected", async () => {
  await assert.rejects(()=>preparePhoto({size:9*1024*1024}), /слишком большое/);
  await assert.rejects(()=>preparePhoto(new Blob(["<svg>not an image</svg>"])), /JPG/);
});
test("photo and recipe are published together", async () => {
  const mock = github();
  const photo = new Blob([Uint8Array.from([255,216,255,224,0,0,0])]);
  const result = await publishRecipe({token:"github_pat_test",input,photo,request:mock.request});
  assert.match(result.recipe.image,/^assets\/uploads\/[\w-]+\.jpg$/);
  const paths = mock.calls.find(call=>call.path==="/git/trees").body.tree.map(file=>file.path);
  assert.equal(paths.includes(result.recipe.image),true);
});
