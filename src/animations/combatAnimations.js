import { effectFor } from './animationMap.js';
import { playEffect } from './AnimationService.js';
import { magicElementFor, magicEffectFor, magicTintFor } from './magicAnimationMap.js';
import { weaponMeleeEffect } from './weaponAnimationMap.js';
import { resolveTokenFromRef } from './resolveTokens.js';

// Ki weapon accents depend on the element, independently of the selected critical table.
const KI_ANIMATION_ELEMENTS = new Map([
  ['fire', 'fire'],
  ['air', 'lightning'],
  ['water', 'water'],
  ['earth', 'earth'],
  ['light', 'light'],
  ['darkness', 'dark']
]);

/**
 * Reproduce el efecto de un resultado de combate 1v1 que impacto causando dano.
 *
 * - Conjuros/poderes (flags.attackData.isSpell || psychicDiscipline): efecto ELEMENTAL
 *   segun la via / tipo de dano / disciplina (fuego, hielo, rayo, arcano...). Proyectil del
 *   lanzador al defensor si es a distancia, y luego impacto puntual o EXPLOSION de area
 *   (si areaRadius > 0) sobre el defensor.
 * - Ataques fisicos: proyectil (si a distancia) + impacto por tabla de dano (armorType).
 *
 * Degradado silencioso (playEffect es no-op si faltan Sequencer/JB2A o el efecto no existe).
 * @param {object} flags  message.flags.animabf (kind === 'combatResult').
 */
export async function playCombatResultAnimation(flags) {
  // Con varios GMs, solo el primario dispara (Sequencer hace broadcast al resto).
  if (game.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;

  const defenderRef = flags?.defender?.tokenId || flags?.defender?.actorId || '';
  const defenderToken = resolveTokenFromRef(defenderRef);
  if (!defenderToken) return; // sin destino no hay nada que mostrar

  const result = flags?.result ?? {};
  if (Number.isFinite(result.difference) && result.difference <= 0) {
    if (!flags.resistTheHit) playDefenseAnimation(defenderToken, flags.defenseType);
    return;
  }
  if (!(Number(result.damageFinal) > 0)) return;

  const ad = flags?.attackData ?? {};
  const armorType = flags?.result?.armorType ?? ad.armorType ?? '';
  const attackerRef =
    flags?.attacker?.tokenId ||
    flags?.result?.attackerId ||
    flags?.attacker?.actorId ||
    '';
  const attackerToken = resolveTokenFromRef(attackerRef);

  // --- Magia / Psiquica: efecto elemental (via/dano/disciplina), explosion si es de area ---
  if (ad.isSpell || ad.psychicDiscipline) {
    const element = magicElementFor({
      via: ad.spellVia,
      damageType: armorType,
      psychicDiscipline: ad.psychicDiscipline
    });
    const isArea = Number(ad.areaRadius) > 0;
    // Tinte por concepto para las vias abstractas (solo cuando el elemento es 'arcane').
    const tint = magicTintFor(ad.spellVia, element);

    if (ad.isProjectile && attackerToken) {
      await playEffect({
        file: magicEffectFor(element, 'proj'),
        source: attackerToken,
        target: defenderToken,
        opts: { waitUntilFinished: true, tint } // el impacto va DESPUES de que llegue
      });
    }
    await playEffect({
      file: magicEffectFor(element, isArea ? 'explosion' : 'impact'),
      source: defenderToken,
      opts: { scaleToObject: isArea ? 2 : 1.5, fadeOut: 400, tint }
    });
    return;
  }

  // --- Fisico: TODA la animacion de ataque de arma se reproduce AL ATACAR
  //     (playWeaponAttackAnimation, en el flujo de ataque). Aqui no se hace nada, para
  //     unificar todo el efecto en el momento del ataque (no duplicar en la defensa).
}

/**
 * Weapon attacks retain their melee swing and add a local elemental accent.
 * Air crackles with electricity; Fire flares at the weapon's target. These effects
 * decorate the declared attack, without casting circles or spell projectiles.
 * With no target, both effects play on the attacker. Missing assets safely skip.
 */
export function playWeaponAttackAnimation(
  attackerToken,
  targetTokens,
  weapon,
  attackData = {}
) {
  const element = KI_ANIMATION_ELEMENTS.get(attackData?.kiElement);
  if (!attackerToken || (!weapon && !element)) return;
  const targets = (Array.isArray(targetTokens) ? targetTokens : []).filter(Boolean);
  const weaponFile = weapon
    ? weaponMeleeEffect(weapon.name, weapon.system?.critic?.primary?.value)
    : null;
  const accentFile =
    element === 'lightning'
      ? ['jb2a.static_electricity.01.blue', 'jb2a.static_electricity.03.blue']
      : magicEffectFor(element, 'impact');
  for (const target of targets.length ? targets : [null]) {
    if (weaponFile) {
      playEffect({
        file: weaponFile,
        source: attackerToken,
        target,
        opts: target
          ? { fadeOut: 400 }
          : { attachTo: true, scaleToObject: 3, fadeOut: 400 }
      });
    }
    if (accentFile) {
      playEffect({
        file: accentFile,
        source: target ?? attackerToken,
        opts: { attachTo: !target, scaleToObject: 1.2, fadeOut: 250 }
      });
    }
  }
}

/**
 * Circulo de lanzamiento (o escudo, si combatType === 'defense') del elemento sobre el
 * lanzador. Se llama al lanzar un conjuro/poder para el "build-up" visual. Degradado
 * silencioso. No await: es decorativo, no debe bloquear el flujo de lanzamiento.
 */
export function playSpellCastAnimation(
  casterToken,
  { via, damageType, psychicDiscipline, combatType } = {}
) {
  if (!casterToken) return;
  const element = magicElementFor({ via, damageType, psychicDiscipline });
  const isDefense = combatType === 'defense';
  const tint = magicTintFor(via, element);
  playEffect({
    file: magicEffectFor(element, isDefense ? 'shield' : 'cast'),
    source: casterToken,
    opts: isDefense
      ? { scaleToObject: 1.8, fadeIn: 200, fadeOut: 500, tint }
      : { belowTokens: true, scaleToObject: 1.6, fadeIn: 200, fadeOut: 500, tint }
  });
}

/** Successful defense only: armor absorbing a hit is not a dodge or a parry. */
export function playDefenseAnimation(token, defenseType) {
  const action = {
    dodge: 'defenseDodge',
    block: 'defenseBlock',
    shield: 'defenseShield',
    supernaturalShield: 'defenseShield'
  }[defenseType];
  if (!token || !action) return;
  return playEffect({
    file: effectFor(action),
    source: token,
    opts: { scaleToObject: 1.5, fadeOut: 300 }
  });
}

/** Automatic defenses share the same reactions as individual result cards. */
export function playMultiDefenseAnimation(flags) {
  if (game.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;
  for (const entry of flags?.entries ?? []) {
    if (!Number.isFinite(entry.difference) || entry.difference > 0) continue;
    playDefenseAnimation(
      resolveTokenFromRef(entry.tokenId || entry.actorId),
      entry.defenseType
    );
  }
}
