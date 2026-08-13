import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from monte_carlo import damage_for_roll


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


if __name__ == "__main__":
    unittest.main()
