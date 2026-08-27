# Changelog

## [1.18.0](https://github.com/iumalabs/odograph/compare/v1.17.0...v1.18.0) (2026-08-27)


### Features

* add Cloudflare OIDC as a fourth sign-in method ([#269](https://github.com/iumalabs/odograph/issues/269)) ([99d6e19](https://github.com/iumalabs/odograph/commit/99d6e19d0dee0a8bfd75149f41ef3f393c7265f4))

## [1.17.0](https://github.com/iumalabs/odograph/compare/v1.16.1...v1.17.0) (2026-08-26)


### Features

* add RU/EN interface language toggle ([#260](https://github.com/iumalabs/odograph/issues/260)) ([3b24025](https://github.com/iumalabs/odograph/commit/3b24025be6493ae70dc028d67d3d7ccadef693c1))


### Bug Fixes

* close header dropdowns on Escape and prevent them from stacking ([#262](https://github.com/iumalabs/odograph/issues/262)) ([3003be6](https://github.com/iumalabs/odograph/commit/3003be61c3d030cac92e4c15e406da12e23c3312))
* navigate to the record's own screen from search results ([#264](https://github.com/iumalabs/odograph/issues/264)) ([acf4afe](https://github.com/iumalabs/odograph/commit/acf4afe83640bb74ca05792676a122c3ebe92847))

## [1.16.1](https://github.com/iumalabs/odograph/compare/v1.16.0...v1.16.1) (2026-08-26)


### Bug Fixes

* pin magic-link emails to the canonical production domain ([#257](https://github.com/iumalabs/odograph/issues/257)) ([37500f2](https://github.com/iumalabs/odograph/commit/37500f29dfe57ca342a4134f3a7612f67ce3ee36))

## [1.16.0](https://github.com/iumalabs/odograph/compare/v1.15.0...v1.16.0) (2026-08-26)


### Features

* real client-side routing — /app shell, stable / landing URL ([#254](https://github.com/iumalabs/odograph/issues/254)) ([7f87074](https://github.com/iumalabs/odograph/commit/7f870746853de70e992f635b9795e2eb309c0424))

## [1.15.0](https://github.com/iumalabs/odograph/compare/v1.14.0...v1.15.0) (2026-08-26)


### Features

* account page with real credentials, session info, and sign-out ([#249](https://github.com/iumalabs/odograph/issues/249)) ([5b417c6](https://github.com/iumalabs/odograph/commit/5b417c62ad6cc153bcf1aaa2e98062caa21bbe1b))
* in-app documentation viewer ([#246](https://github.com/iumalabs/odograph/issues/246)) ([e98605b](https://github.com/iumalabs/odograph/commit/e98605b2cf54aac6cdab01745e27bd24a013b9d0))


### Bug Fixes

* hide redundant "Take Photo" button on desktop ([#253](https://github.com/iumalabs/odograph/issues/253)) ([baa3ca6](https://github.com/iumalabs/odograph/commit/baa3ca6a0180cdcceb39615759a388b92f45563c))
* stop Dashboard from flashing zeroed/empty aggregates on every navigation ([#252](https://github.com/iumalabs/odograph/issues/252)) ([867718d](https://github.com/iumalabs/odograph/commit/867718d8afd5d4f589a46e0c97cade353a0047ee))

## [1.14.0](https://github.com/iumalabs/odograph/compare/v1.13.6...v1.14.0) (2026-08-26)


### Features

* public landing page for unauthenticated visitors ([#245](https://github.com/iumalabs/odograph/issues/245)) ([404b384](https://github.com/iumalabs/odograph/commit/404b38485d2a2c1e64e66c9f2f38e558700d527c))


### Bug Fixes

* cap shared content area at max-width:1180px, centered ([#243](https://github.com/iumalabs/odograph/issues/243)) ([382b7ba](https://github.com/iumalabs/odograph/commit/382b7ba8e423ec45ce2248cd2f9aa35202938f61))

## [1.13.6](https://github.com/iumalabs/odograph/compare/v1.13.5...v1.13.6) (2026-08-25)


### Bug Fixes

* convert cost-per-distance to the display odometer unit (issue [#236](https://github.com/iumalabs/odograph/issues/236)) ([#239](https://github.com/iumalabs/odograph/issues/239)) ([241d013](https://github.com/iumalabs/odograph/commit/241d013f86e592e453af3a2403df95a2c49f1b62))

## [1.13.5](https://github.com/maksimyugai/odograph/compare/v1.13.4...v1.13.5) (2026-08-25)


### Bug Fixes

* send email from odograph.iuma.dev, now onboarded separately (issue [#223](https://github.com/maksimyugai/odograph/issues/223)) ([#227](https://github.com/maksimyugai/odograph/issues/227)) ([c072a7e](https://github.com/maksimyugai/odograph/commit/c072a7ef5120b9774a05cce7e504e15a12c430ac))

## [1.13.4](https://github.com/maksimyugai/odograph/compare/v1.13.3...v1.13.4) (2026-08-25)


### Bug Fixes

* send email from odograph.iuma.dev instead of odograph.dev (issue [#223](https://github.com/maksimyugai/odograph/issues/223)) ([#224](https://github.com/maksimyugai/odograph/issues/224)) ([f447aa7](https://github.com/maksimyugai/odograph/commit/f447aa70fafa9b66e15e8ce5889dd4eb93a6e0be))

## [1.13.3](https://github.com/maksimyugai/odograph/compare/v1.13.2...v1.13.3) (2026-08-25)


### Bug Fixes

* require a file before Add Photo can be submitted (issue [#220](https://github.com/maksimyugai/odograph/issues/220)) ([#221](https://github.com/maksimyugai/odograph/issues/221)) ([1e97f45](https://github.com/maksimyugai/odograph/commit/1e97f455e8e9d02d07848fd64efbc2d987cad18c))
* stop Dashboard's expense breakdown from losing its own fetch race (issue [#207](https://github.com/maksimyugai/odograph/issues/207)) ([#219](https://github.com/maksimyugai/odograph/issues/219)) ([0298007](https://github.com/maksimyugai/odograph/commit/02980073f2df7786369c0de7110e9f5a6395b9e0))

## [1.13.2](https://github.com/maksimyugai/odograph/compare/v1.13.1...v1.13.2) (2026-08-24)


### Bug Fixes

* block empty Add Vehicle submit and fix bottom-nav label crowding (issues [#214](https://github.com/maksimyugai/odograph/issues/214), [#215](https://github.com/maksimyugai/odograph/issues/215)) ([#218](https://github.com/maksimyugai/odograph/issues/218)) ([18b0abe](https://github.com/maksimyugai/odograph/commit/18b0abebd3ffccb9c41cbe98792448366c8bf9fc))
* stack Reminders explainer panel and reposition toast on mobile (issues [#210](https://github.com/maksimyugai/odograph/issues/210), [#211](https://github.com/maksimyugai/odograph/issues/211)) ([#216](https://github.com/maksimyugai/odograph/issues/216)) ([8828388](https://github.com/maksimyugai/odograph/commit/8828388ba93129150b81ac78bb4c03be854fa912))

## [1.13.1](https://github.com/maksimyugai/odograph/compare/v1.13.0...v1.13.1) (2026-08-24)


### Bug Fixes

* strip Sentry's dev-only DSN validator from production builds (issue [#205](https://github.com/maksimyugai/odograph/issues/205), severity:high) ([#206](https://github.com/maksimyugai/odograph/issues/206)) ([5b10647](https://github.com/maksimyugai/odograph/commit/5b10647553f421d935a30bcb5f8f3f344b7be6c8))

## [1.13.0](https://github.com/maksimyugai/odograph/compare/v1.12.1...v1.13.0) (2026-08-23)


### Features

* production error & performance monitoring via FlightDeck ([#203](https://github.com/maksimyugai/odograph/issues/203)) ([4ce4858](https://github.com/maksimyugai/odograph/commit/4ce48580ba55af7c4f8990717eacb17f001a5d2d))

## [1.12.1](https://github.com/maksimyugai/odograph/compare/v1.12.0...v1.12.1) (2026-08-14)


### Bug Fixes

* add a responsive mobile breakpoint (issue [#190](https://github.com/maksimyugai/odograph/issues/190), severity:high) ([#193](https://github.com/maksimyugai/odograph/issues/193)) ([4739029](https://github.com/maksimyugai/odograph/commit/47390292148bda2cc268f1f4699e0336cc84c81b))
* stop Vite from inlining fonts as CSP-blocked data: URIs (issue [#191](https://github.com/maksimyugai/odograph/issues/191), severity:low) ([#192](https://github.com/maksimyugai/odograph/issues/192)) ([a4cff1d](https://github.com/maksimyugai/odograph/commit/a4cff1db6c885168f267cdc6f9bcaeed550f3197))

## [1.12.0](https://github.com/maksimyugai/odograph/compare/v1.11.1...v1.12.0) (2026-08-14)


### Features

* let owners upload a vehicle cover photo from the Garage card ([#188](https://github.com/maksimyugai/odograph/issues/188)) ([f8de1fc](https://github.com/maksimyugai/odograph/commit/f8de1fc522277c23aa82c98319e3d9e5f466a135))
* show cost-per-100-distance on Garage cards ([#189](https://github.com/maksimyugai/odograph/issues/189)) ([5fabc56](https://github.com/maksimyugai/odograph/commit/5fabc56093cfb73330a0307a0281269ac6e21f75))


### Bug Fixes

* **client:** center the Garage cover-photo crop on the actual box ([#186](https://github.com/maksimyugai/odograph/issues/186)) ([d2b98bf](https://github.com/maksimyugai/odograph/commit/d2b98bffb20081918ec59ed9689648103018f3a8))

## [1.11.1](https://github.com/maksimyugai/odograph/compare/v1.11.0...v1.11.1) (2026-08-14)


### Bug Fixes

* refresh service records when planner/reminder mark-done syncs ([#184](https://github.com/maksimyugai/odograph/issues/184)) ([91497e4](https://github.com/maksimyugai/odograph/commit/91497e4b8258bb6a5c4c237ac72c451de9543aaf)), closes [#180](https://github.com/maksimyugai/odograph/issues/180)
* show error banner on every view, not just Garage ([#183](https://github.com/maksimyugai/odograph/issues/183)) ([fb9a043](https://github.com/maksimyugai/odograph/commit/fb9a043236cf8f29cfd586751638bc9d8e5970a0)), closes [#179](https://github.com/maksimyugai/odograph/issues/179)
* **vehicles:** accept year: null on create, not just PATCH (issue [#178](https://github.com/maksimyugai/odograph/issues/178), critical) ([#181](https://github.com/maksimyugai/odograph/issues/181)) ([3afdeb9](https://github.com/maksimyugai/odograph/commit/3afdeb9f71543ed17bc49362c48681185667b7a2))

## [1.11.0](https://github.com/maksimyugai/odograph/compare/v1.10.1...v1.11.0) (2026-08-14)


### Features

* add per-vehicle photo gallery screen from the design mockup ([#175](https://github.com/maksimyugai/odograph/issues/175)) ([7a4c583](https://github.com/maksimyugai/odograph/commit/7a4c583b8536253ddd9ea01ddfc465cf7a5079f7))

## [1.10.1](https://github.com/maksimyugai/odograph/compare/v1.10.0...v1.10.1) (2026-08-14)


### Bug Fixes

* **client:** stop cropping vehicle photos, enlarge the garage-card thumbnail ([#173](https://github.com/maksimyugai/odograph/issues/173)) ([7121981](https://github.com/maksimyugai/odograph/commit/71219818d03807b17a967f66eaee47451cb8a8d7))

## [1.10.0](https://github.com/maksimyugai/odograph/compare/v1.9.0...v1.10.0) (2026-08-14)


### Features

* import LubeLogger history for Subaru Legacy, add vehicle photo support ([#172](https://github.com/maksimyugai/odograph/issues/172)) ([d83a32a](https://github.com/maksimyugai/odograph/commit/d83a32a173ad9900768722172a58414f4a888817))


### Bug Fixes

* **client:** always keep a vehicle selected in the picker ([#170](https://github.com/maksimyugai/odograph/issues/170)) ([c95ea09](https://github.com/maksimyugai/odograph/commit/c95ea09a89f703e6b4bf1664a9c26310870d3e27))

## [1.9.0](https://github.com/maksimyugai/odograph/compare/v1.8.0...v1.9.0) (2026-08-14)


### Features

* infer next-service-due estimate from service history (spec 053, issue [#167](https://github.com/maksimyugai/odograph/issues/167)) ([#168](https://github.com/maksimyugai/odograph/issues/168)) ([be4169a](https://github.com/maksimyugai/odograph/commit/be4169a29c2a61c12cf265ce6fc4d00400ef838f))

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
