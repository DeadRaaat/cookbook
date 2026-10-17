"""Validate recipe data and local photo paths before deploying."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def validate_categories(data):
    assert isinstance(data, dict) and isinstance(data.get("categories"), list), "Expected categories list"
    names = set()
    for category in data["categories"]:
        assert isinstance(category, dict) and isinstance(category.get("name"), str) and category["name"].strip(), "Missing category name"
        name = category["name"].strip()
        assert name != "Все", "Category 'Все' is reserved"
        assert name not in names, f"Duplicate category: {name}"
        names.add(name)


def validate(data):
    assert isinstance(data, dict) and isinstance(data.get("recipes"), list), "Expected recipes list"
    for index, recipe in enumerate(data["recipes"], 1):
        assert isinstance(recipe, dict), f"Recipe {index}: expected an object"
        for field in ("title", "cat", "desc", "steps"):
            assert isinstance(recipe.get(field), str) and recipe[field].strip(), f"Recipe {index}: missing {field}"
        assert isinstance(recipe.get("time", ""), str), f"Recipe {index}: invalid time"
        assert recipe["cat"].strip() != "Все", f"Recipe {index}: category 'Все' is reserved"
        assert isinstance(recipe.get("ing"), list) and recipe["ing"], f"Recipe {index}: missing ingredients"
        assert all(isinstance(item, str) and item.strip() for item in recipe["ing"]), f"Recipe {index}: invalid ingredients"
        assert isinstance(recipe.get("emoji", ""), str), f"Recipe {index}: invalid emoji"
        image = recipe.get("image")
        if image:
            assert isinstance(image, str), f"Recipe {index}: invalid photo"
            relative = image.lstrip("/")
            assert relative.startswith("assets/") and not any(char in relative for char in "\\?#:"), f"Recipe {index}: invalid photo path"
            assert all(part not in ("", ".", "..") for part in relative.split("/")), f"Recipe {index}: invalid photo path"
            path = (ROOT / relative).resolve()
            assert path.is_relative_to(ROOT / "assets") and path.is_file(), f"Recipe {index}: photo not found: {image}"


if __name__ == "__main__":
    data = json.loads((ROOT / "data/recipes.json").read_text(encoding="utf-8"))
    validate(data)
    validate_categories(json.loads((ROOT / "data/categories.json").read_text(encoding="utf-8")))
    print(f"Validated {len(data['recipes'])} recipes")
