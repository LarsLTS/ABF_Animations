import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  attackContext,
  defenseReactions,
  legacyAttackForResult
} from '../src/adapter.js';
import { playEffect } from '../src/animations/AnimationService.js';
import { playWeaponAttackAnimation } from '../src/animations/combatAnimations.js';
import { magicEffectFor } from '../src/animations/magicAnimationMap.js';
import { weaponMeleeEffect } from '../src/animations/weaponAnimationMap.js';
import {
  animateLegacyCombatDialog,
  registerLegacyCombatDialogHooks
} from '../src/legacyCombatDialogs.js';
import { collectDependencyReport, dependencyReportHTML } from '../src/dependencyCheck.js';

let token;
let calls;
beforeEach(() => {
  calls = [];
  token = { id: 't', actor: { items: new Map() } };
  globalThis.canvas = { tokens: { get: id => (id === 't' ? token : null) } };
  globalThis.fromUuidSync = ref => (ref === 'Scene.s.Token.t' ? { object: token } : null);
  globalThis.game = {
    actors: new Map(),
    user: { id: 'u' },
    settings: { get: (_scope, key) => (key === 'animationSpeed' ? 0.7 : true) },
    modules: new Map([
      ['sequencer', { active: true }],
      ['JB2A_DnD5e', { active: true }]
    ]),
    messages: { contents: [] }
  };
  globalThis.Sequencer = {
    Database: { entryExists: key => key === 'valid' }
  };
  globalThis.Sequence = function () {
    const chain = new Proxy(
      {},
      {
        get:
          (_obj, key) =>
          (...args) => {
            calls.push([key, ...args]);
            return key === 'play' ? Promise.resolve() : chain;
          }
      }
    );
    return chain;
  };
});

test('legacy attack resolves spell metadata from the unlinked speaker token', () => {
  token.actor.items.set('spell', {
    type: 'spell',
    system: { via: { value: 'fire' } }
  });
  game.actors.set('base', { items: new Map() });
  const context = attackContext({
    speaker: { token: 't' },
    flags: {
      animabf: {
        attackData: { attackerId: 'base', weaponId: 'spell' }
      }
    }
  });
  assert.equal(context.data.isSpell, true);
  assert.equal(context.data.spellVia, 'fire');
  assert.equal(context.token, token);
});

test('legacy psychic attacks infer discipline from their owned item', () => {
  token.actor.items.set('power', {
    type: 'psychicPower',
    system: { discipline: { value: 'telepathy' } }
  });
  assert.equal(
    attackContext({
      speaker: { token: 't' },
      flags: {
        animabf: {
          attackData: { weaponId: 'power' }
        }
      }
    }).data.psychicDiscipline,
    'telepathy'
  );
});

test('defense updates support nested and flat payloads and preserve token UUID', () => {
  const message = {
    id: 'm',
    flags: { animabf: { attackData: { attackAbility: 100 } } }
  };
  const target = {
    state: 'done',
    tokenUuid: 'Scene.s.Token.t',
    defenseResult: {
      defenseAbility: 100,
      defenseType: 'block'
    }
  };
  const flat = defenseReactions(message, { 'flags.animabf.targets': [target] });
  const nested = defenseReactions(message, {
    flags: { animabf: { targets: [target] } }
  });
  assert.deepEqual(flat, nested);
  assert.equal(flat[0].tokenRef, 'Scene.s.Token.t');
  assert.equal(flat[0].type, 'block');
  target.defenseResult.resistTheHit = true;
  assert.deepEqual(defenseReactions(message, { 'flags.animabf.targets': [target] }), []);
});

test('failed defense and missing totals do not produce successful reactions', () => {
  const message = {
    flags: { animabf: { attackData: { attackAbility: 100 } } }
  };
  for (const defenseAbility of [50, undefined]) {
    assert.deepEqual(
      defenseReactions(message, {
        'flags.animabf.targets': [
          {
            state: 'done',
            defenseResult: { defenseAbility, defenseType: 'dodge' }
          }
        ]
      }),
      []
    );
  }
});

test('legacy impact source must be uniquely identifiable', () => {
  const message = {
    flags: {
      animabf: {
        kind: 'attackData',
        targets: [
          {
            state: 'rolling',
            tokenUuid: 'Scene.s.Token.t'
          }
        ]
      }
    }
  };
  game.messages.contents = [message];
  assert.equal(legacyAttackForResult({ defender: { tokenId: 't' } }), message);
  game.messages.contents.push(structuredClone(message));
  assert.equal(legacyAttackForResult({ defender: { tokenId: 't' } }), null);
});

test('playback selects existing fallback and uses module speed setting', async () => {
  await playEffect({ file: ['absent', 'valid'], source: token });
  assert.ok(calls.some(call => call[0] === 'file' && call[1] === 'valid'));
  assert.ok(calls.some(call => call[0] === 'playbackRate' && call[1] === 0.7));
});

test('missing JB2A, disabled playback or unavailable assets safely skip', async () => {
  await playEffect({ file: 'absent' });
  assert.equal(calls.length, 0);
  game.modules.delete('JB2A_DnD5e');
  await playEffect({ file: 'valid' });
  assert.equal(calls.length, 0);
});

const weapon = {
  name: 'Espada',
  system: { critic: { primary: { value: 'cut' } } }
};
const elements = [
  ['fire', 'fire'],
  ['air', 'lightning'],
  ['water', 'water'],
  ['earth', 'earth'],
  ['light', 'light'],
  ['darkness', 'dark']
];

for (const [kiElement, animation] of elements) {
  test(`${kiElement} decorates a weapon swing independently of its critical table`, () => {
    Sequencer.Database.entryExists = () => true;
    const target = { id: 'defender' };
    playWeaponAttackAnimation(token, [target], weapon, { kiElement, armorType: 'cut' });
    assert.deepEqual(
      calls.filter(call => call[0] === 'file'),
      [
        ['file', weaponMeleeEffect(weapon.name, 'cut')[0]],
        [
          'file',
          animation === 'lightning'
            ? 'jb2a.static_electricity.01.blue'
            : magicEffectFor(animation, 'impact')[0]
        ]
      ]
    );
    assert.ok(calls.some(call => call[0] === 'atLocation' && call[1] === token));
    assert.ok(calls.some(call => call[0] === 'stretchTo' && call[1] === target));
    assert.equal(calls.filter(call => call[0] === 'play').length, 2);
  });
}

test('without targets the weapon swing and accent play on the exact attacker token', () => {
  Sequencer.Database.entryExists = () => true;
  playWeaponAttackAnimation(token, [], weapon, { kiElement: 'light' });
  assert.ok(
    calls.some(
      call => call[0] === 'file' && call[1] === magicEffectFor('light', 'impact')[0]
    )
  );
  assert.ok(calls.some(call => call[0] === 'attachTo' && call[1] === token));
  assert.equal(calls.filter(call => call[0] === 'stretchTo').length, 0);
});

test('older attacks, unknown elements and missing elemental assets retain the weapon swing', () => {
  const fallback = weaponMeleeEffect(weapon.name, 'cut')[0];
  Sequencer.Database.entryExists = file => file === fallback;
  for (const data of [{}, { kiElement: 'metal' }, { kiElement: 'darkness' }]) {
    calls = [];
    playWeaponAttackAnimation(token, [token], weapon, data);
    assert.deepEqual(
      calls.filter(call => call[0] === 'file'),
      [['file', fallback]]
    );
  }
});

test('elemental metadata works without an owned weapon and skips missing dependencies', () => {
  Sequencer.Database.entryExists = () => true;
  playWeaponAttackAnimation(token, [token], undefined, { kiElement: 'water' });
  assert.ok(
    calls.some(
      call => call[0] === 'file' && call[1] === magicEffectFor('water', 'impact')[0]
    )
  );
  calls = [];
  game.modules.delete('JB2A_DnD5e');
  playWeaponAttackAnimation(token, [token], weapon, { kiElement: 'fire' });
  assert.equal(calls.length, 0);
  game.modules.set('JB2A_DnD5e', { active: true });
  game.settings.get = () => false;
  playWeaponAttackAnimation(token, [token], weapon, { kiElement: 'fire' });
  assert.equal(calls.length, 0);
});

test('module init registers isolated settings and suppresses only built-in animation reads', async () => {
  const hooks = new Map();
  globalThis.Hooks = {
    once: (name, callback) => hooks.set(name, callback),
    on: (name, callback) => hooks.set(name, callback)
  };
  game.system = { id: 'animabf', version: '2.2.3' };
  game.animabf = {};
  game.modules.set('abf-animations', {});
  const registered = [];
  const menus = [];
  globalThis.foundry = {
    applications: { api: { DialogV2: class {} } }
  };
  game.settings = {
    register: (scope, key, options) => registered.push({ scope, key, options }),
    registerMenu: (scope, key, options) => menus.push({ scope, key, options }),
    get: scope => (scope === 'other-module' ? 'unchanged' : true)
  };
  await import('../src/main.js');
  hooks.get('init')();
  assert.equal(
    registered.find(setting => setting.key === 'animationSpeed').options.default,
    0.7
  );
  assert.ok(registered.every(setting => setting.scope === 'abf-animations'));
  assert.equal(menus[0].key, 'checkDependencies');
  assert.equal(menus[0].scope, 'abf-animations');
  assert.equal(typeof hooks.get('renderGMCombatDialog'), 'function');
  assert.ok(menus[0].options.type.prototype instanceof foundry.applications.api.DialogV2);
  assert.equal(game.settings.get('animabf', 'enableAnimations'), false);
  assert.equal(game.settings.get('abf-animations', 'enableAnimations'), true);
  assert.equal(game.settings.get('other-module', 'some-setting'), 'unchanged');
  assert.equal(typeof game.modules.get('abf-animations').api.play, 'function');
  // Exercise the real chat hook: one weapon swing and one accent, without duplicate broadcasts.
  Sequencer.Database.entryExists = () => true;
  token.actor.items.set('weapon', weapon);
  for (const [kiElement, animation] of elements) {
    calls = [];
    const message = {
      speaker: { token: 't' },
      flags: {
        animabf: {
          kind: 'attackData',
          attackData: { weaponId: 'weapon', kiElement, armorType: 'cut' },
          targets: [{ tokenUuid: 'Scene.s.Token.t' }]
        }
      }
    };
    hooks.get('createChatMessage')(message, {}, 'u');
    assert.deepEqual(
      calls.filter(call => call[0] === 'file'),
      [
        ['file', weaponMeleeEffect(weapon.name, 'cut')[0]],
        [
          'file',
          animation === 'lightning'
            ? 'jb2a.static_electricity.01.blue'
            : magicEffectFor(animation, 'impact')[0]
        ]
      ]
    );
    assert.equal(calls.filter(call => call[0] === 'play').length, 2);
    calls = [];
    hooks.get('createChatMessage')(message, {}, 'another-player');
    assert.equal(calls.length, 0);
  }
});

const newerVersion = (a, b) => a.localeCompare(b, undefined, { numeric: true }) > 0;
function dependencyFixture() {
  const modules = new Map([
    [
      'abf-animations',
      {
        id: 'abf-animations',
        title: 'ABF Animations',
        active: true,
        version: '0.2.0',
        relationships: {
          requires: [{ id: 'sequencer', type: 'module' }],
          systems: [{ id: 'animabf', compatibility: { minimum: '2.2.3' } }]
        }
      }
    ],
    ['sequencer', { id: 'sequencer', active: true, version: '3.0.0' }],
    ['JB2A_DnD5e', { id: 'JB2A_DnD5e', active: true, version: '0.7.4' }]
  ]);
  return {
    modules,
    system: { id: 'animabf', version: '2.2.3' },
    isNewerVersion: newerVersion
  };
}

test('dependency check follows disabled modules, system requirements, shared constraints and cycles', () => {
  const fixture = dependencyFixture();
  fixture.modules.get('sequencer').relationships = {
    requires: [{ id: 'socketlib', compatibility: { minimum: '2.0.0' } }, { id: 'absent' }]
  };
  fixture.modules.set('socketlib', {
    id: 'socketlib',
    active: false,
    version: '1.0.0',
    relationships: { requires: [{ id: 'sequencer' }, { id: 'nested-missing' }] }
  });
  fixture.system.relationships = {
    requires: [{ id: 'socketlib', compatibility: { minimum: '3.0.0' } }]
  };
  const rows = collectDependencyReport(fixture);
  const socket = rows.find(row => row.id === 'socketlib');
  assert.deepEqual(socket.issues, [
    'Disabled',
    'Requires version 2.0.0 or newer',
    'Requires version 3.0.0 or newer'
  ]);
  assert.deepEqual(socket.requiredBy, ['sequencer', 'animabf']);
  assert.deepEqual(rows.find(row => row.id === 'nested-missing').issues, ['Missing']);
  assert.equal(rows.filter(row => row.id === 'sequencer').length, 1);
});

test('dependency check accepts either JB2A library and checks the Free minimum', () => {
  const fixture = dependencyFixture();
  assert.ok(collectDependencyReport(fixture).every(row => !row.issues.length));
  fixture.modules.get('JB2A_DnD5e').version = '0.7.3';
  assert.deepEqual(
    collectDependencyReport(fixture).find(row => row.id === 'JB2A_DnD5e').issues,
    ['Requires version 0.7.4 or newer']
  );
  fixture.modules.set('jb2a_patreon', {
    id: 'jb2a_patreon',
    active: true,
    version: '0.7.2',
    relationships: { requires: [{ id: 'patreon-dependency' }] }
  });
  const rows = collectDependencyReport(fixture);
  assert.ok(!rows.some(row => row.id === 'JB2A_DnD5e'));
  assert.deepEqual(rows.find(row => row.id === 'jb2a_patreon').issues, []);
  assert.deepEqual(rows.find(row => row.id === 'patreon-dependency').issues, ['Missing']);
});

test('dependency check distinguishes disabled JB2A from an absent library and checks system versions', () => {
  const fixture = dependencyFixture();
  fixture.modules.get('JB2A_DnD5e').active = false;
  fixture.system.version = '2.2.2';
  let rows = collectDependencyReport(fixture);
  assert.deepEqual(rows.find(row => row.id === 'JB2A_DnD5e').issues, ['Disabled']);
  assert.deepEqual(rows.find(row => row.id === 'animabf').issues, [
    'Requires version 2.2.3 or newer'
  ]);
  fixture.modules.delete('JB2A_DnD5e');
  rows = collectDependencyReport(fixture);
  assert.deepEqual(rows.find(row => row.title === 'JB2A Free or Patreon').issues, [
    'Missing'
  ]);
});

test('dependency report escapes package metadata before rendering', () => {
  const fixture = dependencyFixture();
  fixture.modules.get('sequencer').title = '<script>alert("x")</script>';
  const html = dependencyReportHTML(collectDependencyReport(fixture));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('All required packages are installed'));
});

function legacyDialog(type = 'combat') {
  game.system = { id: 'animabf', version: '2.2.3' };
  game.user.isGM = true;
  Sequencer.Database.entryExists = () => true;
  const defenderToken = { id: 'defender', actor: { items: new Map() } };
  canvas.tokens.get = id =>
    id === 't' ? token : id === 'defender' ? defenderToken : null;
  const item = {
    id: 'item',
    name: 'Sword',
    type: type === 'mystic' ? 'spell' : type === 'psychic' ? 'psychicPower' : 'weapon',
    system: {
      critic: { primary: { value: 'cut' } },
      via: { value: 'fire' },
      discipline: { value: 'telepathy' }
    }
  };
  token.actor.items.set('item', item);
  return {
    modalData: {
      attacker: {
        token: { id: token.id, object: token },
        actor: token.actor,
        result: {
          type,
          values: {
            weaponUsed: type === 'combat' ? 'item' : '',
            spellUsed: type === 'mystic' ? 'item' : '',
            powerUsed: type === 'psychic' ? 'item' : '',
            critic: 'cut',
            projectile: { value: true }
          }
        }
      },
      defender: {
        token: { id: defenderToken.id, object: defenderToken },
        actor: defenderToken.actor
      }
    }
  };
}

test('legacy macro dialog animates a weapon declaration once across redraws', async () => {
  const dialog = legacyDialog();
  await animateLegacyCombatDialog(dialog);
  await animateLegacyCombatDialog(dialog);
  assert.equal(calls.filter(([key]) => key === 'play').length, 1);
  assert.ok(
    calls.some(([key, target]) => key === 'stretchTo' && target.id === 'defender')
  );
  dialog.modalData.defender.result = { type: 'combat', values: { type: 'dodge' } };
  dialog.modalData.calculations = { difference: -20, damage: 0 };
  await animateLegacyCombatDialog(dialog);
  await animateLegacyCombatDialog(dialog);
  assert.equal(calls.filter(([key]) => key === 'play').length, 2);
  assert.ok(
    calls.some(([key, file]) => key === 'file' && file === 'jb2a.wind_lines.01.01.white')
  );
});

test('legacy spell and psychic hits use item metadata and animate after defense arrives', async () => {
  for (const type of ['mystic', 'psychic']) {
    calls = [];
    const dialog = legacyDialog(type);
    // The combat dialog is owned by its receiving GM, even if another GM is elected.
    game.users = { activeGM: { id: 'another-gm' } };
    await animateLegacyCombatDialog(dialog);
    assert.equal(calls.filter(([key]) => key === 'play').length, 1);
    dialog.modalData.defender.result = { type: 'combat', values: { type: 'block' } };
    dialog.modalData.calculations = { difference: 50, damage: 30 };
    await animateLegacyCombatDialog(dialog);
    await animateLegacyCombatDialog(dialog);
    assert.equal(calls.filter(([key]) => key === 'play').length, 3);
    assert.ok(calls.some(([key]) => key === 'stretchTo'));
    const impact = magicEffectFor(type === 'mystic' ? 'fire' : 'mind', 'impact')[0];
    assert.ok(calls.some(([key, file]) => key === 'file' && file === impact));
  }
});

test('legacy resistance, failed defenses and armor absorbing damage do not show a successful defense', async () => {
  for (const [type, difference] of [
    ['resistance', -20],
    ['combat', 50]
  ]) {
    calls = [];
    const dialog = legacyDialog();
    dialog.modalData.defender.result = { type, values: { type: 'dodge' } };
    dialog.modalData.calculations = { difference, damage: 0 };
    await animateLegacyCombatDialog(dialog);
    assert.equal(calls.filter(([key]) => key === 'play').length, 1);
  }
});

test('legacy counterattacks animate again after the dialog changes roles', async () => {
  const dialog = legacyDialog();
  await animateLegacyCombatDialog(dialog);
  const attacker = dialog.modalData.attacker;
  dialog.modalData.attacker = { ...dialog.modalData.defender, result: undefined };
  dialog.modalData.defender = { ...attacker, result: undefined };
  dialog.modalData.calculations = undefined;
  await animateLegacyCombatDialog(dialog);
  dialog.modalData.attacker.result = { type: 'combat', values: { critic: 'impact' } };
  await animateLegacyCombatDialog(dialog);
  await animateLegacyCombatDialog(dialog);
  assert.equal(calls.filter(([key]) => key === 'play').length, 2);
  assert.equal(calls.filter(([key]) => key === 'atLocation').at(-1)[1].id, 'defender');
});

test('legacy dialog playback is GM-only and safely skips unavailable assets', async () => {
  const dialog = legacyDialog();
  game.user.isGM = false;
  await animateLegacyCombatDialog(dialog);
  assert.equal(calls.length, 0);
  game.user.isGM = true;
  Sequencer.Database.entryExists = () => false;
  await animateLegacyCombatDialog(dialog);
  assert.equal(calls.length, 0);
});

test('Anima 3.x never registers or runs legacy dialog playback or emits its warnings', async () => {
  const registered = [];
  const warnings = [];
  const originalWarn = console.warn;
  globalThis.Hooks = { on: (...args) => registered.push(args) };
  game.user.isGM = true;
  console.warn = (...args) => warnings.push(args);
  const unsupportedDialog = {
    get modalData() {
      throw new Error('Legacy dialog data must not be accessed');
    }
  };
  try {
    for (const version of ['3.0.0', '3.4.16']) {
      game.system = { id: 'animabf', version };
      registerLegacyCombatDialogHooks();
      await animateLegacyCombatDialog(unsupportedDialog);
    }
    assert.equal(registered.length, 0);
    assert.equal(calls.length, 0);
    assert.equal(warnings.length, 0);
    game.system.version = '2.2.3';
    registerLegacyCombatDialogHooks();
    assert.equal(registered[0][0], 'renderGMCombatDialog');
  } finally {
    console.warn = originalWarn;
  }
});

test('Anima 3.x initializes without legacy hooks or warnings and retains chat attack and defense playback', async () => {
  const hooks = new Map();
  const warnings = [];
  const originalWarn = console.warn;
  globalThis.Hooks = {
    once: (name, callback) => hooks.set(name, callback),
    on: (name, callback) => hooks.set(name, callback)
  };
  globalThis.foundry = { applications: { api: { DialogV2: class {} } } };
  globalThis.ui = { notifications: { warn: message => warnings.push(message) } };
  game.system = { id: 'animabf', version: '3.4.16' };
  game.user.isGM = true;
  game.users = { activeGM: game.user };
  game.modules.set('abf-animations', {});
  game.settings.register = () => {};
  game.settings.registerMenu = () => {};
  Sequencer.Database.entryExists = () => true;
  token.actor.items.set('weapon', {
    type: 'weapon',
    name: 'Sword',
    system: { critic: { primary: { value: 'cut' } } }
  });
  console.warn = (...args) => warnings.push(args);
  try {
    await import('../src/main.js?modern-system-regression');
    hooks.get('init')();
    hooks.get('ready')();
    assert.ok(!hooks.has('renderGMCombatDialog'));
    const message = {
      id: 'modern-attack',
      speaker: { token: 't' },
      flags: {
        animabf: {
          kind: 'attackData',
          attackData: { weaponId: 'weapon', attackAbility: 150, kiElement: 'fire' },
          targets: [{ tokenUuid: 't', state: 'pending' }]
        }
      }
    };
    hooks.get('createChatMessage')(message, {}, 'u');
    assert.equal(calls.filter(([key]) => key === 'play').length, 2);
    hooks.get('updateChatMessage')(
      message,
      {
        'flags.animabf.targets': [
          {
            tokenUuid: 't',
            state: 'done',
            defenseResult: { defenseAbility: 200, defenseType: 'dodge' }
          }
        ]
      },
      {},
      'u'
    );
    assert.equal(calls.filter(([key]) => key === 'play').length, 3);
    assert.equal(warnings.length, 0);
  } finally {
    console.warn = originalWarn;
  }
});
