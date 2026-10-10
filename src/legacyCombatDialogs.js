import {
  playCombatResultAnimation,
  playDefenseAnimation,
  playSpellCastAnimation,
  playWeaponAttackAnimation
} from './animations/combatAnimations.js';

const played = new WeakMap();
const tokenObject = token => token?.object ?? token;
const isLegacySystem = () =>
  game.system?.id === 'animabf' && /^2\./.test(game.system.version ?? '');

/** Anima 3.x removed these dialogs and uses the separate chat-message integration. */
export function registerLegacyCombatDialogHooks() {
  if (!isLegacySystem()) return;
  Hooks.on('renderGMCombatDialog', dialog => {
    void animateLegacyCombatDialog(dialog).catch(error => {
      console.warn('[ABF animations] Combat dialog playback failed:', error);
    });
  });
}

/** The macro/socket combat flow stores roll results on its GM dialog, not chat flags. */
export async function animateLegacyCombatDialog(dialog) {
  if (!isLegacySystem() || !game.user?.isGM) return;
  const { attacker, defender, calculations } = dialog.modalData ?? {};
  const attack = attacker?.result;
  if (!attack) {
    played.delete(dialog);
    return;
  }
  if (!['combat', 'mystic', 'psychic'].includes(attack.type)) return;
  const source = tokenObject(attacker.token);
  const target = tokenObject(defender?.token);
  if (!source || !target) return;

  const values = attack.values ?? {};
  const itemId = values.weaponUsed || values.spellUsed || values.powerUsed;
  const item =
    attacker.actor?.items?.get?.(itemId) ?? attack.weapon ?? attack.spell ?? attack.power;
  const attackData = {
    isSpell: attack.type === 'mystic',
    psychicDiscipline:
      attack.type === 'psychic' ? item?.system?.discipline?.value || 'arcane' : undefined,
    spellVia: item?.system?.via?.value,
    armorType: values.critic,
    isProjectile: !!values.projectile?.value,
    areaRadius: values.areaRadius,
    kiElement: values.kiElement
  };
  let state = played.get(dialog);
  if (state?.attack !== attack) {
    state = { attack };
    played.set(dialog, state);
    if (attack.type === 'combat') {
      const weapon = item ?? {
        name: values.weaponName || 'Unarmed',
        system: { critic: { primary: { value: values.critic } } }
      };
      playWeaponAttackAnimation(source, [target], weapon, attackData);
    } else {
      playSpellCastAnimation(source, {
        via: attackData.spellVia,
        damageType: attackData.armorType,
        psychicDiscipline: attackData.psychicDiscipline
      });
    }
  }

  const defense = defender?.result;
  if (!defense || !calculations || state.defense === defense) return;
  const difference = Number(calculations.difference);
  if (!Number.isFinite(difference)) return;
  state.defense = defense;
  if (difference <= 0) {
    // Resistance means taking the hit; it is not an evasive or blocking defense.
    if (defense.type === 'resistance') return;
    playDefenseAnimation(
      target,
      defense.type === 'combat' ? defense.values?.type : 'shield'
    );
  } else if (attack.type !== 'combat') {
    await playCombatResultAnimation(
      {
        attackData,
        attacker: { tokenId: source.id },
        defender: { tokenId: target.id },
        result: { difference, damageFinal: calculations.damage }
      },
      { checkPrimaryGM: false }
    );
  }
}
