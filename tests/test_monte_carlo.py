import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from monte_carlo import conversion_damage, damage_for_roll


class BlackBreakDamageTests(unittest.TestCase):
    def test_black_converts_only_one_break_per_rerolled_die(self):
        weapon = {"bonusDamage": 0}
        pool = {"break": 1, "hope": 0, "power": 0}

        # White faces 4, 2 and 0 contain 1 Power plus 1, 2 and 3 Breaks.
        cases = [(4, 2), (2, 3), (0, 3)]
        for face_index, expected_damage in cases:
            with self.subTest(face_index=face_index):
                rolls = (("white", face_index, True),)
                self.assertEqual(damage_for_roll(rolls, weapon, pool), expected_damage)


class HopeConversionTests(unittest.TestCase):
    def test_hope_converts_hope_before_break(self):
        self.assertEqual(conversion_damage(1, 2, {"break": 0, "hope": 1}), 1)

    def test_unused_hope_converts_break_without_double_spending_it(self):
        self.assertEqual(conversion_damage(2, 1, {"break": 0, "hope": 2}), 2)
        self.assertEqual(conversion_damage(2, 1, {"break": 1, "hope": 2}), 3)


if __name__ == "__main__":
    unittest.main()
