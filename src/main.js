import {
  registerAnimationHooks,
  registerAnimationSettings
} from './animations/registerAnimations.js';
import { playEffect } from './animations/AnimationService.js';
import {
  playCombatResultAnimation,
  playDefenseAnimation,
  playSpellCastAnimation,
  playWeaponAttackAnimation
} from './animations/combatAnimations.js';
import { resolveTokenFromRef } from './animations/resolveTokens.js';
import {
  attackContext,
  defenseReactions,
  flagsFor,
  legacyAttackForResult
} from './adapter.js';

const MODULE_ID = 'abf-animations';
const reacted = new Set();

function primaryClient(userId) {
  return game.users?.activeGM
    ? game.user?.id === game.users.activeGM.id
    : game.user?.id === userId;
}

function suppressBuiltInAnimations() {
  // Runtime override only: do not change the world's saved system preference.
  const original = game.settings.get;
  game.settings.get = function (scope, key, ...args) {
    if (scope === 'animabf' && key === 'enableAnimations') return false;
    return original.call(this, scope, key, ...args);
  };
}

Hooks.once('init', () => {
  if (game.system.id !== 'animabf') return;
  registerAnimationSettings();
  registerAnimationHooks();
  suppressBuiltInAnimations();
});

Hooks.on('createChatMessage', (message, _options, userId) => {
  if (game.system.id !== 'animabf' || !primaryClient(userId)) return;
  const flags = flagsFor(message);
  if (flags.kind === 'attackData') {
    const { token, item, data } = attackContext(message);
    if (data.isSpell || data.psychicDiscipline) {
      playSpellCastAnimation(token, {
        via: data.spellVia,
        psychicDiscipline: data.psychicDiscipline,
        damageType: data.armorType
      });
    } else {
      const targets = (flags.targets ?? data.targets ?? [])
        .map(target => resolveTokenFromRef(target.tokenUuid || target.actorUuid))
        .filter(Boolean);
      playWeaponAttackAnimation(token, targets, item);
    }
  }
  if (flags.kind === 'combatResult' && flags.result?.maneuverSlug !== 'dano-retrasado') {
    // Defense reactions use source-message updates on both system versions.
    if (Number(flags.result?.difference) <= 0) return;
    const source = legacyAttackForResult(flags);
    const context = source ? attackContext(source) : null;
    void playCombatResultAnimation({
      ...flags,
      attackData: flags.attackData ?? context?.data,
      attacker: flags.attacker ?? { tokenId: context?.token?.id }
    });
  }
});

Hooks.on('updateChatMessage', (message, changes, _options, userId) => {
  if (game.system.id !== 'animabf' || !primaryClient(userId)) return;
  for (const reaction of defenseReactions(message, changes)) {
    if (reacted.has(reaction.key)) continue;
    reacted.add(reaction.key);
    playDefenseAnimation(resolveTokenFromRef(reaction.tokenRef), reaction.type);
  }
});

Hooks.on('deleteChatMessage', message => {
  for (const key of reacted) if (key.startsWith(`${message.id}:`)) reacted.delete(key);
});

Hooks.on('createItem', (item, _options, userId) => {
  if (game.system.id !== 'animabf' || game.user?.id !== userId) return;
  if (item.type !== 'supernaturalShield' || !item.actor) return;
  for (const token of item.actor.getActiveTokens?.() ?? []) {
    playSpellCastAnimation(token, { combatType: 'defense' });
  }
});

Hooks.once('ready', () => {
  if (game.system.id !== 'animabf') return;
  const module = game.modules.get(MODULE_ID);
  module.api = { ...module.api, play: playEffect };
  if (!['JB2A_DnD5e', 'jb2a_patreon'].some(id => game.modules.get(id)?.active)) {
    ui.notifications.warn(
      'ABF Animations requires an active JB2A free or Patreon module.'
    );
  }
});
