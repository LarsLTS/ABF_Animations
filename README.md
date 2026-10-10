# ABF Animations

A standalone Foundry VTT module for Anima Beyond Fantasy (`animabf`), using Sequencer and JB2A. Default animation speed: **0.7**.

## Installation

Install using this manifest URL:

```text
https://raw.githubusercontent.com/LarsLTS/ABF_Animations/main/module.json
```

Enable **Sequencer**, either **JB2A Free Content** (`JB2A_DnD5e`) or **JB2A Patreon** (`jb2a_patreon`), and **ABF Animations** in your Anima world. Configure playback under Settings → Module Settings → ABF Animations. Reload all connected clients after enabling the module.

No JB2A media is bundled. The module uses installed database entries and safely skips unavailable assets.

## Compatibility

Targets Foundry 13–14 and the inspected Anima 2.2.3 and 3.4.16 checkouts. Automated tests verify adapters; live visual testing on both versions is still required.

| Action | Anima 2.2.3 | Anima 3.4.16 |
| --- | --- | --- |
| Weapon attacks | Attack-card event | Attack-card event |
| Offensive spell/psychic casts | Element inferred from owned item | Item and attack metadata |
| Successful dodge/block/shield defense | Source attack's defense-result update | Same event |
| Supernatural shield creation | Generic shield animation | Generic shield animation |
| Damaging spell/psychic impacts | Only when a unique rolling source attack identifies the context | Result-card metadata |
| Ki charging, Zeon accumulation, technique activation | No equivalent action flags in this version | Actor/item update flags |

Automatic defense batches currently provide defensive reactions; elemental damage impacts require individual result cards. Utility spells/powers without attack cards are not inferred from chat text. Persistent charging visuals follow the existing action toggles; charging already active when a scene loads is not restored automatically.

The module suppresses the newer system's built-in animations while active by intercepting only its `enableAnimations` setting read. It does not change the saved setting. Disabling this module and reloading restores built-in behavior. The module does not alter rolls, resources or combat calculations.

## Development

```sh
npm test
npm run check
```

Source is served directly; no build or dependency installation is required. To test locally, copy this repository into your Foundry `Data/modules/abf-animations` directory, excluding `.git` and `test`, and reload.

## Source attribution

Animation maps and playback helpers were extracted from [LarsLTS/AnimaBeyondFoundry](https://github.com/LarsLTS/AnimaBeyondFoundry), feature branch `feat/expand-jb2a-action-animations` at `28788366`. Original comments and mappings are retained. JB2A and Sequencer remain separate dependencies and retain their own licenses.
