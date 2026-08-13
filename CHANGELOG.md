# Changelog

## [1.8.0](https://github.com/maksimyugai/odograph/compare/v1.7.0...v1.8.0) (2026-08-13)


### Features

* marking a reminder done logs a service record (spec 049, issue [#154](https://github.com/maksimyugai/odograph/issues/154)) ([#157](https://github.com/maksimyugai/odograph/issues/157)) ([540a0fc](https://github.com/maksimyugai/odograph/commit/540a0fc45e7c3f598ce464c29944498b935fe484))
* units toggle converts fuel economy (spec 050, issue [#155](https://github.com/maksimyugai/odograph/issues/155)) ([#158](https://github.com/maksimyugai/odograph/issues/158)) ([b317f0b](https://github.com/maksimyugai/odograph/commit/b317f0b2a9abf312e0714c08618da89f0fb818fc))


### Bug Fixes

* **auth:** gate dev-only routes by allow-list, not deny-list (security) ([#152](https://github.com/maksimyugai/odograph/issues/152)) ([f387c71](https://github.com/maksimyugai/odograph/commit/f387c7162d5e060cb9630348bdaf248767880988))
* **idempotency:** scope the write-operation ledger by route, not just tenant+key ([#165](https://github.com/maksimyugai/odograph/issues/165)) ([8645481](https://github.com/maksimyugai/odograph/commit/86454810b4c7313f402465dfdc1d7a52c215bcd2))


### Performance Improvements

* **client:** code-split non-initial views (spec 051, issue [#161](https://github.com/maksimyugai/odograph/issues/161)) ([#163](https://github.com/maksimyugai/odograph/issues/163)) ([0ac8a7f](https://github.com/maksimyugai/odograph/commit/0ac8a7f762d7bba706832fc5461d722b7d6ae3d9))
* **client:** compress large photo attachments before upload (spec 052, issue [#162](https://github.com/maksimyugai/odograph/issues/162)) ([#164](https://github.com/maksimyugai/odograph/issues/164)) ([ab2febf](https://github.com/maksimyugai/odograph/commit/ab2febf17d33ca07c59379456f627fcb44483a92))
* **client:** stop Dashboard from re-fetching data App.tsx already has ([#160](https://github.com/maksimyugai/odograph/issues/160)) ([0e4715a](https://github.com/maksimyugai/odograph/commit/0e4715ad75d0949390afab4b1ea8e216483c1d74))

## [1.7.0](https://github.com/maksimyugai/odograph/compare/v1.6.0...v1.7.0) (2026-08-13)


### Features

* replace Russian Ruble with Kyrgyzstani Som in currency list (spec 048) ([#150](https://github.com/maksimyugai/odograph/issues/150)) ([b15fc31](https://github.com/maksimyugai/odograph/commit/b15fc3175e5fde03a5c12cab440cc45adb7e3441))

## [1.6.0](https://github.com/maksimyugai/odograph/compare/v1.5.0...v1.6.0) (2026-08-13)


### Features

* document expiry progress bar (spec 045, issue [#142](https://github.com/maksimyugai/odograph/issues/142)) ([#147](https://github.com/maksimyugai/odograph/issues/147)) ([72bbabd](https://github.com/maksimyugai/odograph/commit/72bbabd3ec4c08daae98be0b73eb43b57cbfe56d))
* due-in text for Dashboard upcoming reminders (spec 043, issue [#139](https://github.com/maksimyugai/odograph/issues/139)) ([#145](https://github.com/maksimyugai/odograph/issues/145)) ([a30a340](https://github.com/maksimyugai/odograph/commit/a30a340181a50d65d907e141c94f085173f9f338))
* header currency and units toggles (spec 047, issue [#136](https://github.com/maksimyugai/odograph/issues/136)) ([#149](https://github.com/maksimyugai/odograph/issues/149)) ([7c74ef8](https://github.com/maksimyugai/odograph/commit/7c74ef8a5918d50b2952eb89b47ccad6ebba91ac))
* header vehicle switcher and quick-fuel shortcut (spec 039, issue [#127](https://github.com/maksimyugai/odograph/issues/127)) ([#132](https://github.com/maksimyugai/odograph/issues/132)) ([6e411e8](https://github.com/maksimyugai/odograph/commit/6e411e82ee5d9f79852d42041bb6d59b192fdcb0))
* label Dashboard chart bars with their monthly total (spec 042, issue [#140](https://github.com/maksimyugai/odograph/issues/140)) ([#144](https://github.com/maksimyugai/odograph/issues/144)) ([dc34bdd](https://github.com/maksimyugai/odograph/commit/dc34bdddebfe88e68578f54824dca6e3336d366b))
* live fuel economy/cost-per-distance preview (spec 040, issue [#128](https://github.com/maksimyugai/odograph/issues/128)) ([#134](https://github.com/maksimyugai/odograph/issues/134)) ([f579902](https://github.com/maksimyugai/odograph/commit/f57990247e673053e5be1445ef3072747b7174e1))
* reminders screen info panel with legend and recently-completed list (spec 044, issue [#141](https://github.com/maksimyugai/odograph/issues/141)) ([#146](https://github.com/maksimyugai/odograph/issues/146)) ([cf28242](https://github.com/maksimyugai/odograph/commit/cf282424fe449c8a32ff71f141d2928172e08cce))
* richer Garage cards - large stats and reminder progress bar (spec 041, issue [#138](https://github.com/maksimyugai/odograph/issues/138)) ([#143](https://github.com/maksimyugai/odograph/issues/143)) ([bca09bf](https://github.com/maksimyugai/odograph/commit/bca09bf099f6aaea41d7b99ce32721b4470b5bdf))
* toast save confirmations for the six create actions (spec 046, issue [#137](https://github.com/maksimyugai/odograph/issues/137)) ([#148](https://github.com/maksimyugai/odograph/issues/148)) ([6c8da10](https://github.com/maksimyugai/odograph/commit/6c8da106ffb76723ea81ee5613d8589c687e252d))

## [1.5.0](https://github.com/maksimyugai/odograph/compare/v1.4.0...v1.5.0) (2026-08-12)


### Features

* promote Fuel/Service/Reminders/Planner/Documents to top-level nav ([#126](https://github.com/maksimyugai/odograph/issues/126)) ([#131](https://github.com/maksimyugai/odograph/issues/131)) ([12f51c5](https://github.com/maksimyugai/odograph/commit/12f51c55e23b5ce53fa4ddd4e5c38087c5269851))
* rewrite Dashboard as a per-vehicle deep-dive ([#125](https://github.com/maksimyugai/odograph/issues/125)) ([#129](https://github.com/maksimyugai/odograph/issues/129)) ([803f925](https://github.com/maksimyugai/odograph/commit/803f9257e7d8be939fbdde9e93dbee6853c18af3))

## [1.4.0](https://github.com/maksimyugai/odograph/compare/v1.3.0...v1.4.0) (2026-08-12)


### Features

* add currency display setting ([#120](https://github.com/maksimyugai/odograph/issues/120)) ([#121](https://github.com/maksimyugai/odograph/issues/121)) ([1956904](https://github.com/maksimyugai/odograph/commit/19569042c88896eebb281bf875bcfa2988fb08e1))
* add quick-renew shortcut for expired/coming-up documents ([#123](https://github.com/maksimyugai/odograph/issues/123)) ([#124](https://github.com/maksimyugai/odograph/issues/124)) ([39b7120](https://github.com/maksimyugai/odograph/commit/39b7120ae2725276047d11c3bbbcbeeb711c280f))

## [1.3.0](https://github.com/maksimyugai/odograph/compare/v1.2.0...v1.3.0) (2026-08-12)


### Features

* show current odometer and reminder attention on Garage cards ([#107](https://github.com/maksimyugai/odograph/issues/107)) ([#117](https://github.com/maksimyugai/odograph/issues/117)) ([b3b3d97](https://github.com/maksimyugai/odograph/commit/b3b3d97ecfe6d90c0427740f1379e4cecb0e9a66))

## [1.2.0](https://github.com/maksimyugai/odograph/compare/v1.1.0...v1.2.0) (2026-08-12)


### Features

* show app version under the logo ([#113](https://github.com/maksimyugai/odograph/issues/113)) ([71ac0a4](https://github.com/maksimyugai/odograph/commit/71ac0a4b05d142839f7940ae51a9552d3c02fdc3))


### Bug Fixes

* **ci:** pass --repo to gh workflow run in release-please.yml ([#115](https://github.com/maksimyugai/odograph/issues/115)) ([ad8ae10](https://github.com/maksimyugai/odograph/commit/ad8ae10673c6d8d10600881cd2b45cfb484d17fd))

## [1.1.0](https://github.com/maksimyugai/odograph/compare/v1.0.0...v1.1.0) (2026-08-12)


### Features

* add performed-by (self/shop) field to service records ([#105](https://github.com/maksimyugai/odograph/issues/105)) ([#109](https://github.com/maksimyugai/odograph/issues/109)) ([1203713](https://github.com/maksimyugai/odograph/commit/12037139ad923ec9a51f0a8db793dc2c5fdfc71d))
