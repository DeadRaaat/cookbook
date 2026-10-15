import copy
import json
import unittest

from validate_recipes import ROOT, validate, validate_categories


class RecipeValidationTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / "data/recipes.json").read_text(encoding="utf-8"))

    def test_existing_recipes(self):
        validate(self.data)

    def test_empty_collection(self):
        validate({"recipes": []})

    def test_photo_with_pages_media_path(self):
        self.data["recipes"][0]["image"] = "/assets/homemade-bread.jpeg"
        validate(self.data)

    def test_invalid_required_fields(self):
        for field in ("title", "cat", "time", "desc", "steps", "ing"):
            with self.subTest(field=field):
                invalid = copy.deepcopy(self.data)
                del invalid["recipes"][0][field]
                with self.assertRaises(AssertionError):
                    validate(invalid)

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
