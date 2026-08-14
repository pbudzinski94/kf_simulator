"""Monte Carlo cross-check for the Forlorn Forge probability engine.

Run from the repository root:
    python tests/monte_carlo.py
    python tests/monte_carlo.py --trials 100000 --seed 123
    python tests/monte_carlo.py --check
"""

from __future__ import annotations

import argparse
import itertools
import json
import random
import shutil
import statistics
import subprocess
import sys
from collections import Counter
from functools import lru_cache
from pathlib import Path


POWER_DICE = {
    "red": ((0, 0, 1), (2, 0, 1), (0, 1, 0), (1, 0, 0), (1, 1, 0), (1, 1, 0)),
    "black": ((2, 0, 1), (0, 1, 1), (1, 1, 0), (2, 2, 0), (2, 2, 1), (1, 1, 0)),
    "white": ((1, 3, 0), (3, 2, 1), (1, 2, 1), (2, 3, 0), (1, 1, 1), (2, 1, 1)),
}
COLORS = ("red", "black", "white")
COLOR_ORDER = {color: index for index, color in enumerate(COLORS)}

DEFAULT_CONFIG = {
    "monster": {"toHit": 7, "at": 9},
    "portrait": {"red": 1, "black": 0, "white": 0},
    "pool": {
        "opening": 3,
        "break": 2,
        "hope": 0,
        "power": 2,
        "attackRerolls": 1,
        "powerRerolls": 1,
        "black": 2,
    },
    "weapons": [
        {
            "name": "Knighves",
            "attackDice": 2,
            "attackBonus": 1,
            "bonusDamage": 1,
            "perHit": {"red": 2, "black": 0, "white": 0},
            "extraDice": {"red": 1, "black": 0, "white": 0},
        },
        {
            "name": "Broń II",
            "attackDice": 1,
            "attackBonus": 1,
            "bonusDamage": 2,
            "perHit": {"red": 1, "black": 2, "white": 0},
            "extraDice": {"red": 1, "black": 0, "white": 0},
        },
    ],
}


def is_hit(roll: int, to_hit: int, modifier: int) -> bool:
    return roll == 10 or (roll != 1 and roll + modifier >= to_hit)


def power_counts(weapon: dict, portrait: dict, hits: int) -> dict[str, int]:
    return {
        color: int(portrait[color]) + int(weapon["extraDice"][color]) + int(weapon["perHit"][color]) * hits
        for color in COLORS
    }


def conversion_damage(break_symbols: int, hope_symbols: int, pool: dict) -> int:
    hope_tokens = int(pool["hope"])
    hope_damage = min(hope_symbols, hope_tokens)
    remaining_hope = hope_tokens - hope_damage
    break_damage = min(break_symbols, int(pool["break"]) + remaining_hope)
    return hope_damage + break_damage


def damage_for_roll(rolls: tuple[tuple[str, int, bool], ...], weapon: dict, pool: dict) -> int:
    power = normal_break = hope = black_break = 0
    for color, face_index, used_black in rolls:
        face_power, face_break, face_hope = POWER_DICE[color][face_index]
        power += face_power
        hope += face_hope
        if used_black:
            black_break += min(face_break, 1)
            normal_break += max(face_break - 1, 0)
        else:
            normal_break += face_break
    return (
        power
        + black_break
        + conversion_damage(normal_break, hope, pool)
        + int(weapon["bonusDamage"])
        + int(pool["power"])
    )


def make_power_strategy(weapon: dict, pool: dict, armor_threshold: int):
    regular_limit = int(pool.get("powerRerolls", 0))
    black_limit = int(pool.get("black", 0))

    @lru_cache(maxsize=None)
    def choose_plan(initial_rolls: tuple[tuple[str, int], ...]) -> tuple[int, ...]:
        # 0 = keep, 1 = regular Power reroll, 2 = Black reroll.
        best_plan = (0,) * len(initial_rolls)
        kept = tuple((color, face, False) for color, face in initial_rolls)
        kept_damage = damage_for_roll(kept, weapon, pool)
        best_score = (1.0 if kept_damage >= armor_threshold else 0.0, float(kept_damage))

        for plan in itertools.product((0, 1, 2), repeat=len(initial_rolls)):
            regular_used = plan.count(1)
            black_used = plan.count(2)
            if not (regular_used or black_used):
                continue
            if regular_used > regular_limit or black_used > black_limit:
                continue

            rerolled_positions = [index for index, action in enumerate(plan) if action]
            wounds = 0
            damage_sum = 0
            outcomes = 6 ** len(rerolled_positions)
            for new_faces in itertools.product(range(6), repeat=len(rerolled_positions)):
                face_by_position = dict(zip(rerolled_positions, new_faces))
                final_roll = tuple(
                    (
                        color,
                        face_by_position.get(index, old_face),
                        plan[index] == 2,
                    )
                    for index, (color, old_face) in enumerate(initial_rolls)
                )
                damage = damage_for_roll(final_roll, weapon, pool)
                damage_sum += damage
                wounds += damage >= armor_threshold
            score = (wounds / outcomes, damage_sum / outcomes)
            if score[0] > best_score[0] + 1e-12 or (
                abs(score[0] - best_score[0]) <= 1e-12 and score[1] > best_score[1] + 1e-12
            ):
                best_score = score
                best_plan = plan
        return best_plan

    return choose_plan


def simulate_attack(rng: random.Random, config: dict, weapon: dict, choose_power_plan) -> tuple[int, bool, bool]:
    monster = config["monster"]
    pool = config["pool"]
    modifier = int(weapon["attackBonus"]) + int(pool["opening"])
    attack_rolls = [rng.randint(1, 10) for _ in range(int(weapon["attackDice"]))]
    misses = [index for index, roll in enumerate(attack_rolls) if not is_hit(roll, monster["toHit"], modifier)]
    for index in misses[: int(pool.get("attackRerolls", 0))]:
        attack_rolls[index] = rng.randint(1, 10)
    hits = sum(is_hit(roll, monster["toHit"], modifier) for roll in attack_rolls)
    if hits == 0:
        return 0, False, True

    rolls = []
    for color, count in power_counts(weapon, config["portrait"], hits).items():
        rolls.extend((color, rng.randrange(6)) for _ in range(count))
    rolls.sort(key=lambda item: (COLOR_ORDER[item[0]], item[1]))
    plan = choose_power_plan(tuple(rolls))
    final_rolls = []
    for (color, old_face), action in zip(rolls, plan):
        new_face = rng.randrange(6) if action else old_face
        final_rolls.append((color, new_face, action == 2))
    damage = damage_for_roll(tuple(final_rolls), weapon, pool)
    return damage, damage >= int(monster["at"]), False


def run_monte_carlo(config: dict, trials: int, seed: int) -> list[dict]:
    results = []
    for weapon_index, weapon in enumerate(config["weapons"]):
        rng = random.Random(seed + weapon_index * 1_000_003)
        choose_power_plan = make_power_strategy(weapon, config["pool"], int(config["monster"]["at"]))
        damages = []
        wounds = full_misses = 0
        for _ in range(trials):
            damage, wound, full_miss = simulate_attack(rng, config, weapon, choose_power_plan)
            damages.append(damage)
            wounds += wound
            full_misses += full_miss
        results.append(
            {
                "name": weapon["name"],
                "woundChance": wounds / trials,
                "expectedDamage": statistics.fmean(damages),
                "fullMissChance": full_misses / trials,
                "histogram": Counter(damages),
                "strategyStates": choose_power_plan.cache_info().currsize,
            }
        )
    return results


def exact_results(config: dict) -> list[dict] | None:
    node = shutil.which("node")
    if not node:
        return None
    helper = Path(__file__).with_name("exact_reference.js")
    process = subprocess.run(
        [node, str(helper)],
        input=json.dumps(config),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(process.stdout)


def print_report(simulated: list[dict], exact: list[dict] | None, trials: int, seed: int) -> None:
    print(f"Monte Carlo: {trials:,} ataków na broń, seed={seed}".replace(",", " "))
    for index, result in enumerate(simulated):
        print(f"\n{result['name']}")
        print(f"  rana:       {result['woundChance']:.3%}")
        print(f"  średni DMG: {result['expectedDamage']:.4f}")
        print(f"  Full Miss:  {result['fullMissChance']:.3%}")
        if exact:
            reference = exact[index]
            print(f"  dokładnie:  rana {reference['woundChance']:.3%}, DMG {reference['expectedDamage']:.4f}")
            print(
                f"  odchylenie: rana {result['woundChance'] - reference['woundChance']:+.3%}, "
                f"DMG {result['expectedDamage'] - reference['expectedDamage']:+.4f}"
            )
        top = sorted(result["histogram"].items())
        print("  rozkład:    " + ", ".join(f"{damage}={count / trials:.1%}" for damage, count in top))


def main() -> int:
    parser = argparse.ArgumentParser(description="Monte Carlo test for Forlorn Forge")
    parser.add_argument("--trials", type=int, default=10_000, help="liczba ataków na broń (domyślnie 10000)")
    parser.add_argument("--seed", type=int, default=20260812, help="seed generatora")
    parser.add_argument("--config", type=Path, help="opcjonalny plik JSON z monster, portrait, pool i weapons")
    parser.add_argument("--check", action="store_true", help="zakończ błędem, jeśli wynik za bardzo odbiega od silnika")
    args = parser.parse_args()
    if args.trials <= 0:
        parser.error("--trials musi być większe od zera")

    config = json.loads(args.config.read_text(encoding="utf-8")) if args.config else DEFAULT_CONFIG
    simulated = run_monte_carlo(config, args.trials, args.seed)
    exact = exact_results(config)
    print_report(simulated, exact, args.trials, args.seed)

    if args.check:
        if exact is None:
            print("Tryb --check wymaga Node.js do pobrania wyniku dokładnego.", file=sys.stderr)
            return 2
        wound_tolerance = max(0.02, 2 / (args.trials ** 0.5))
        damage_tolerance = max(0.20, 20 / (args.trials ** 0.5))
        for simulated_result, exact_result in zip(simulated, exact):
            if abs(simulated_result["woundChance"] - exact_result["woundChance"]) > wound_tolerance:
                raise AssertionError(f"{simulated_result['name']}: woundChance poza tolerancją")
            if abs(simulated_result["expectedDamage"] - exact_result["expectedDamage"]) > damage_tolerance:
                raise AssertionError(f"{simulated_result['name']}: expectedDamage poza tolerancją")
        print("\nPASS: Monte Carlo mieści się w ustalonej tolerancji statystycznej.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
