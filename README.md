# ABF Animations

[![Latest release](https://img.shields.io/github/v/release/LarsLTS/ABF_Animations)](https://github.com/LarsLTS/ABF_Animations/releases/latest)
[![Foundry minimum](https://img.shields.io/badge/Foundry-minimum%2013-orange)](https://foundryvtt.com/)
[![Foundry verified](https://img.shields.io/badge/Foundry-verified%2014.369-brightgreen)](https://foundryvtt.com/)
[![Trunk Check](https://github.com/LarsLTS/ABF_Animations/actions/workflows/trunk-check.yml/badge.svg)](https://github.com/LarsLTS/ABF_Animations/actions/workflows/trunk-check.yml)

A Foundry VTT animation module made for [Anima Beyond Fantasy](https://github.com/AnimaBeyondDevelop/AnimaBeyondFoundry).

## Required modules

- [Sequencer](https://github.com/fantasycalendar/FoundryVTT-Sequencer)
- [JB2A](https://github.com/Jules-Bens-Aa/JB2A_DnD5e) — either the free or Patreon library.

## Installation

Install ABF Animations using this manifest URL:

```text
https://github.com/LarsLTS/ABF_Animations/releases/latest/download/module.json
```

Enable ABF Animations and its required modules in your Anima world, then reload Foundry.

## Elemental Ki attacks

When the system records an attack's `kiElement`, the module keeps the weapon swing
and adds an elemental accent at its target. Fire uses a flame impact; Air uses blue
static electricity. Water, Earth, Light and Darkness use their local impact effects.
The element is independent of the critical table selected for armor calculations.
Without a target, the swing and accent play on the attacker. Weapon attacks do not
use casting circles or spell projectiles. Older attacks without an element and
unavailable elemental assets keep the ordinary weapon animation.

## AI usage disclosure

AI tools were used to generate and modify parts of this module's code, tests, configuration, documentation, and UI text. ABF Animations does not use AI services or generate AI content during gameplay. Animation assets are provided by the installed JB2A library and are not bundled with this module.

This project is not eligible for Foundry's **Zero AI** designation. See the [Foundry VTT AI Content Policy](https://foundryvtt.com/article/ai-policy/) for the rules governing official package listings and marketplace submissions.
