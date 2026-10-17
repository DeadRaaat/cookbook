import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from validate_recipes import validate, validate_categories


class RecipeValidationTests(unittest.TestCase):
    def setUp(self):
        # Unit tests must not depend on recipes added or removed by the owner.
        self.data = {
            "recipes": [{
                "title": "Тестовый хлеб",
                "cat": "Хлеб",
                "time": "1 час",
                "desc": "Рецепт только для тестов",
                "ing": ["500 г муки", "350 мл воды"],
                "steps": "Замесите тесто. Выпекайте до готовности.",
            }]
        }
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name).resolve()
        (root / "assets").mkdir()
        (root / "assets/test-photo.jpeg").write_bytes(b"test photo fixture")
        (root / "README.md").write_text("Outside assets", encoding="utf-8")
        root_patch = patch("validate_recipes.ROOT", root)
        root_patch.start()
        self.addCleanup(root_patch.stop)

    def test_valid_recipe(self):
        validate(self.data)

    def test_empty_collection(self):
        validate({"recipes": []})

    def test_photo_with_pages_media_path(self):
        self.data["recipes"][0]["image"] = "/assets/test-photo.jpeg"
        validate(self.data)

    def test_invalid_required_fields(self):
        for field in ("title", "cat", "desc", "steps", "ing"):
            with self.subTest(field=field):
                invalid = copy.deepcopy(self.data)
                del invalid["recipes"][0][field]
                with self.assertRaises(AssertionError):
                    validate(invalid)

    def test_optional_cooking_time(self):
        recipe = self.data["recipes"][0]
        del recipe["time"]
        validate(self.data)
        for value in ("", "   "):
            recipe["time"] = value
            validate(self.data)

    def test_invalid_cooking_time(self):
        self.data["recipes"][0]["time"] = 60
        with self.assertRaises(AssertionError):
            validate(self.data)

    def test_unsafe_or_missing_photo(self):
        for path in ("assets/../README.md", "https://example.com/a.jpg", "assets/not-found.jpg", "assets/uploads/../../index.html"):
            with self.subTest(path=path):
                invalid = copy.deepcopy(self.data)
                invalid["recipes"][0]["image"] = path
                with self.assertRaises(AssertionError):
                    validate(invalid)

    def test_custom_category(self):
        self.data["recipes"][0]["cat"] = "Пироги на закваске"
        validate(self.data)

    def test_reserved_category(self):
        self.data["recipes"][0]["cat"] = "Все"
        with self.assertRaises(AssertionError):
            validate(self.data)

    def test_custom_categories(self):
        validate_categories({"categories": [{"name": "Пироги"}, {"name": "Без глютена"}]})
        validate_categories({"categories": []})

    def test_invalid_categories(self):
        for categories in ([{"name": " "}], [{"name": "Все"}], [{"name": "Пироги"}, {"name": " Пироги "}]):
            with self.subTest(categories=categories):
                with self.assertRaises(AssertionError):
                    validate_categories({"categories": categories})


if __name__ == "__main__":
    unittest.main()
