import { resolveTokenFromRef } from './animations/resolveTokens.js';

export function flagsFor(message) {
  return message?.flags?.animabf ?? {};
}

export function attackContext(message) {
  const data = flagsFor(message).attackData ?? {};
  // Prefer the exact speaker token, including its synthetic actor.
  const token = resolveTokenFromRef(message?.speaker?.token || data.attackerId);
  const actor =
    token?.actor ?? game.actors?.get?.(data.attackerId || message?.speaker?.actor);
  const item = actor?.items?.get?.(data.weaponId);
  return {
    token,
    item,
    data: {
      ...data,
      isSpell: data.isSpell || item?.type === 'spell',
      spellVia: data.spellVia || item?.system?.via?.value,
      psychicDiscipline:
        data.psychicDiscipline ||
        (item?.type === 'psychicPower' ? item.system?.discipline?.value : undefined)
    }
  };
}

export function defenseReactions(message, changes) {
  const path = 'flags.animabf.targets';
  const targets = changes[path] ?? changes.flags?.animabf?.targets;
  if (!Array.isArray(targets)) return [];
  const attack = flagsFor(message).attackData;
  if (!attack) return [];
  return targets.flatMap(target => {
    const defense = target.defenseResult;
    if (target.state !== 'done' || !defense || defense.resistTheHit) return [];
    const difference = Number(attack.attackAbility) - Number(defense.defenseAbility);
    if (!Number.isFinite(difference) || difference > 0) return [];
    return [
      {
        key: `${message.id}:${target.tokenUuid || target.actorUuid}`,
        tokenRef: target.tokenUuid || target.actorUuid,
        type: defense.defenseType
      }
    ];
  });
}

/** Legacy result cards lack attack context. Use only one explicitly rolling target. */
export function legacyAttackForResult(flags) {
  const ref = flags.defender?.tokenId || flags.defender?.actorId;
  if (!ref) return null;
  const candidates = (game.messages?.contents ?? []).filter(message => {
    const f = flagsFor(message);
    return (
      f.kind === 'attackData' &&
      f.targets?.some(
        target =>
          target.state === 'rolling' &&
          (target.tokenUuid === ref ||
            target.tokenUuid?.endsWith(`Token.${ref}`) ||
            (!flags.defender?.tokenId && target.actorUuid === ref))
      )
    );
  });
  return candidates.length === 1 ? candidates[0] : null;
}
