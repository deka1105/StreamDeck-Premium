"""Stage 17.4: the add-on's operation whitelist (runs without Blender)."""
import unittest
import deskassist_blender as d


class Whitelist(unittest.TestCase):
    def test_known_ops_and_clamping(self):
        self.assertEqual(d.validate("focal", 50), ("focal", 50.0, None))
        self.assertEqual(d.validate("focal", 0)[1], 1.0)
        self.assertEqual(d.validate("brush_strength", 7)[1], 1.0)
        self.assertEqual(d.validate("rotation", 720, "z"), ("rotation", 360.0, "Z"))
        self.assertEqual(d.validate("mode", "sculpt")[1], "SCULPT")
        self.assertEqual(d.validate("xray"), ("xray", None, None))

    def test_refused(self):
        for bad in [("exec", "print(1)"), ("mode", "PYTHON"), ("focal", "nan"), ("focal", "1e999"), ("rotation", 10, "W"), ("shading", "X")]:
            with self.assertRaises(ValueError):
                d.validate(*bad)

    def test_no_code_paths(self):
        # Nothing in the table runs text: only choices, numbers and fixed actions.
        for op, (kind, a, b) in d.OPS.items():
            self.assertIn(kind, ("choice", "number", "action"))


if __name__ == "__main__":
    unittest.main()
