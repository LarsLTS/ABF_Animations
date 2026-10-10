import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  attackContext,
  defenseReactions,
  legacyAttackForResult,
} from "../src/adapter.js";
import { playEffect } from "../src/animations/AnimationService.js";

let token;
let calls;
beforeEach(() => {
  calls = [];
  token = { id: "t", actor: { items: new Map() } };
  globalThis.canvas = { tokens: { get: (id) => (id === "t" ? token : null) } };
  globalThis.fromUuidSync = (ref) =>
    ref === "Scene.s.Token.t" ? { object: token } : null;
  globalThis.game = {
    actors: new Map(),
    user: { id: "u" },
    settings: { get: (_scope, key) => (key === "animationSpeed" ? 0.7 : true) },
    modules: new Map([
      ["sequencer", { active: true }],
      ["JB2A_DnD5e", { active: true }],
    ]),
    messages: { contents: [] },
  };
  globalThis.Sequencer = {
    Database: { entryExists: (key) => key === "valid" },
  };
  globalThis.Sequence = function () {
    const chain = new Proxy(
      {},
      {
        get:
          (_obj, key) =>
          (...args) => {
            calls.push([key, ...args]);
            return key === "play" ? Promise.resolve() : chain;
          },
      }
    );
    return chain;
  };
});

test("legacy attack resolves spell metadata from the unlinked speaker token", () => {
  token.actor.items.set("spell", {
    type: "spell",
    system: { via: { value: "fire" } },
  });
  game.actors.set("base", { items: new Map() });
  const context = attackContext({
    speaker: { token: "t" },
    flags: {
      animabf: {
        attackData: { attackerId: "base", weaponId: "spell" },
      },
    },
  });
  assert.equal(context.data.isSpell, true);
  assert.equal(context.data.spellVia, "fire");
  assert.equal(context.token, token);
});

test("legacy psychic attacks infer discipline from their owned item", () => {
  token.actor.items.set("power", {
    type: "psychicPower",
    system: { discipline: { value: "telepathy" } },
  });
  assert.equal(
    attackContext({
      speaker: { token: "t" },
      flags: {
        animabf: {
          attackData: { weaponId: "power" },
        },
      },
    }).data.psychicDiscipline,
    "telepathy"
  );
});

test("defense updates support nested and flat payloads and preserve token UUID", () => {
  const message = {
    id: "m",
    flags: { animabf: { attackData: { attackAbility: 100 } } },
  };
  const target = {
    state: "done",
    tokenUuid: "Scene.s.Token.t",
    defenseResult: {
      defenseAbility: 100,
      defenseType: "block",
    },
  };
  const flat = defenseReactions(message, { "flags.animabf.targets": [target] });
  const nested = defenseReactions(message, {
    flags: { animabf: { targets: [target] } },
  });
  assert.deepEqual(flat, nested);
  assert.equal(flat[0].tokenRef, "Scene.s.Token.t");
  assert.equal(flat[0].type, "block");
  target.defenseResult.resistTheHit = true;
  assert.deepEqual(
    defenseReactions(message, { "flags.animabf.targets": [target] }),
    []
  );
});

test("failed defense and missing totals do not produce successful reactions", () => {
  const message = {
    flags: { animabf: { attackData: { attackAbility: 100 } } },
  };
  for (const defenseAbility of [50, undefined]) {
    assert.deepEqual(
      defenseReactions(message, {
        "flags.animabf.targets": [
          {
            state: "done",
            defenseResult: { defenseAbility, defenseType: "dodge" },
          },
        ],
      }),
      []
    );
  }
});

test("legacy impact source must be uniquely identifiable", () => {
  const message = {
    flags: {
      animabf: {
        kind: "attackData",
        targets: [
          {
            state: "rolling",
            tokenUuid: "Scene.s.Token.t",
          },
        ],
      },
    },
  };
  game.messages.contents = [message];
  assert.equal(legacyAttackForResult({ defender: { tokenId: "t" } }), message);
  game.messages.contents.push(structuredClone(message));
  assert.equal(legacyAttackForResult({ defender: { tokenId: "t" } }), null);
});

test("playback selects existing fallback and uses module speed setting", async () => {
  await playEffect({ file: ["absent", "valid"], source: token });
  assert.ok(calls.some((call) => call[0] === "file" && call[1] === "valid"));
  assert.ok(
    calls.some((call) => call[0] === "playbackRate" && call[1] === 0.7)
  );
});

test("missing JB2A, disabled playback or unavailable assets safely skip", async () => {
  await playEffect({ file: "absent" });
  assert.equal(calls.length, 0);
  game.modules.delete("JB2A_DnD5e");
  await playEffect({ file: "valid" });
  assert.equal(calls.length, 0);
});

test("module init registers isolated settings and suppresses only built-in animation reads", async () => {
  const hooks = new Map();
  globalThis.Hooks = {
    once: (name, callback) => hooks.set(name, callback),
    on: (name, callback) => hooks.set(name, callback),
  };
  game.system = { id: "animabf" };
  game.animabf = {};
  game.modules.set("abf-animations", {});
  const registered = [];
  game.settings = {
    register: (scope, key, options) => registered.push({ scope, key, options }),
    get: (scope, key) => (scope === "other-module" ? "unchanged" : true),
  };
  await import("../src/main.js");
  hooks.get("init")();
  assert.equal(
    registered.find((setting) => setting.key === "animationSpeed").options
      .default,
    0.7
  );
  assert.ok(registered.every((setting) => setting.scope === "abf-animations"));
  assert.equal(game.settings.get("animabf", "enableAnimations"), false);
  assert.equal(game.settings.get("abf-animations", "enableAnimations"), true);
  assert.equal(game.settings.get("other-module", "some-setting"), "unchanged");
  assert.equal(typeof game.modules.get("abf-animations").api.play, "function");
});
