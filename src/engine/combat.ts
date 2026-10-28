import { B } from "./balance";
import type { City, Officer } from "./types";
import { random } from "./rng";
export function power(
  troops: number,
  officer: Officer | undefined,
  training: number,
  defense = 0,
) {
  return (
    troops *
    (1 +
      (officer?.leadership ?? 40) * B.leadershipCombat +
      (officer?.strength ?? 40) * B.strengthCombat) *
    (1 + training * B.trainingCombat) *
    (1 + defense * B.defenseCombat)
  );
}
export function estimate(
  source: City,
  target: City,
  commander: Officer,
  defender: Officer | undefined,
  troops: number,
) {
  return {
    attack: power(troops, commander, source.training),
    defense: power(target.troops, defender, target.training, target.defense),
  };
}
export function resolveCombat(
  source: City,
  target: City,
  commander: Officer,
  defender: Officer | undefined,
  troops: number,
  seed: number,
) {
  const [r, next] = random(seed);
  const p = estimate(source, target, commander, defender, troops);
  const attackPower = p.attack * (B.randomMin + r * B.randomRange),
    defensePower = p.defense;
  const won = attackPower > defensePower;
  const ratio = won
    ? defensePower / attackPower
    : attackPower / Math.max(1, defensePower);
  const attackLoss = Math.min(
    troops,
    Math.ceil(
      troops *
        (won
          ? B.winnerLossBase + B.winnerLossScale * ratio
          : B.loserLossBase + B.loserLossScale * (1 - ratio)),
    ),
  );
  const defenseLoss = won
    ? target.troops
    : Math.min(
        target.troops,
        Math.ceil(
          target.troops * (B.winnerLossBase + B.winnerLossScale * ratio),
        ),
      );
  return {
    attackPower: Math.round(attackPower),
    defensePower: Math.round(defensePower),
    won,
    attackLoss,
    defenseLoss,
    survivors: troops - attackLoss,
    seed: next,
  };
}
export function defenderFor(officers: Officer[], city: City) {
  return officers
    .filter((o) => o.cityId === city.id && o.factionId === city.ownerId)
    .sort((a, b) => b.leadership - a.leadership)[0];
}
