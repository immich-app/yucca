# Changelog

## [0.3.0](https://github.com/immich-app/yucca/compare/v0.2.0...v0.3.0) (2026-06-17)


### Features

* backup retention ([#89](https://github.com/immich-app/yucca/issues/89)) ([e703b08](https://github.com/immich-app/yucca/commit/e703b08b83e8e380284fcf8d178c079a253030c3))
* cancel running tasks (& node:fs repository refactor) ([#81](https://github.com/immich-app/yucca/issues/81)) ([415bb78](https://github.com/immich-app/yucca/commit/415bb7860fb3701b9dda448622307aeef1ebb565))
* configure schedule repositories ([#78](https://github.com/immich-app/yucca/issues/78)) ([6ef94e3](https://github.com/immich-app/yucca/commit/6ef94e355cdd0febc5b8d072163ee5faa256f090))
* device code flow ([#93](https://github.com/immich-app/yucca/issues/93)) ([aac9163](https://github.com/immich-app/yucca/commit/aac91631a9131d35319a87f4635bf6be078fd06a))
* Immich integration ([#65](https://github.com/immich-app/yucca/issues/65)) ([ccdcf37](https://github.com/immich-app/yucca/commit/ccdcf37ebb9966c50d833a98e6baeadecd2de736))
* immich integration (& assorted fixes) ([#77](https://github.com/immich-app/yucca/issues/77)) ([e57db5e](https://github.com/immich-app/yucca/commit/e57db5ef1972983b47c55cbdb077f5679eb689fc))
* immich integration UX ([#87](https://github.com/immich-app/yucca/issues/87)) ([b0d8f2c](https://github.com/immich-app/yucca/commit/b0d8f2c353e832f07cace6fbad2960c1bd2672c5))
* import repositories ([#59](https://github.com/immich-app/yucca/issues/59)) ([b9aafef](https://github.com/immich-app/yucca/commit/b9aafefc21bb3f94cf6f5a7254e0324af6f8cd9d))
* metrics worker (radosgw ingest) ([#123](https://github.com/immich-app/yucca/issues/123)) ([faa2880](https://github.com/immich-app/yucca/commit/faa288087d6ca48bc935d30a90a230886fd8737f))
* reconfigure primary repository backend ([#118](https://github.com/immich-app/yucca/issues/118)) ([10c0a3b](https://github.com/immich-app/yucca/commit/10c0a3b39ce3f005c38ffa95868556337cda0168))
* repository backend ([#49](https://github.com/immich-app/yucca/issues/49)) ([9b0d2e6](https://github.com/immich-app/yucca/commit/9b0d2e62e34537c24262f1ed76d0afb2dbc1a7e0))
* restore backups ([#62](https://github.com/immich-app/yucca/issues/62)) ([e11a654](https://github.com/immich-app/yucca/commit/e11a6546d306200f54ab02ef096d664142f59ae9))
* schedule database backups ([#58](https://github.com/immich-app/yucca/issues/58)) ([48e468d](https://github.com/immich-app/yucca/commit/48e468d69d571a8cde10edbc882b3615d9c798dd))
* sync metrics to customer API ([#84](https://github.com/immich-app/yucca/issues/84)) ([aa0a346](https://github.com/immich-app/yucca/commit/aa0a3464a8448631cf1b6894ff2a9ea5c30b7b72))
* yucca SDK ([#36](https://github.com/immich-app/yucca/issues/36)) ([957c3f8](https://github.com/immich-app/yucca/commit/957c3f8a6c28404e2c5920de6ab76cc59d03afca))
* **yucca sdk:** add authentication handoff ([#39](https://github.com/immich-app/yucca/issues/39)) ([e5981e7](https://github.com/immich-app/yucca/commit/e5981e71fc8bfa1388c2216e035fd49b41d936f4))
* **yucca sdk:** sqlite database for configuration ([#42](https://github.com/immich-app/yucca/issues/42)) ([e383fba](https://github.com/immich-app/yucca/commit/e383fbaea02312cd1426908d972618fa564efe52))


### Bug Fixes

* demo padding ([#103](https://github.com/immich-app/yucca/issues/103)) ([86fff0f](https://github.com/immich-app/yucca/commit/86fff0f42539717d57353d49c33009d851452e85))
* mark incomplete runs as failed on bootstrap ([#108](https://github.com/immich-app/yucca/issues/108)) ([3244657](https://github.com/immich-app/yucca/commit/32446577f8e80090a222e7ff956bc3dde8da53aa))
* redirect to / on login & un-delete migration ([#43](https://github.com/immich-app/yucca/issues/43)) ([6b11685](https://github.com/immich-app/yucca/commit/6b1168593d779ecdb7e5cfddf11e4d1c835f3e65))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @futo-org/backups-api-client bumped to 0.3.0

## [0.2.0](https://github.com/immich-app/yucca/compare/backups-orchestrator-api-v0.1.72...backups-orchestrator-api-v0.2.0) (2026-06-15)


### Features

* backup retention ([#89](https://github.com/immich-app/yucca/issues/89)) ([e703b08](https://github.com/immich-app/yucca/commit/e703b08b83e8e380284fcf8d178c079a253030c3))
* cancel running tasks (& node:fs repository refactor) ([#81](https://github.com/immich-app/yucca/issues/81)) ([415bb78](https://github.com/immich-app/yucca/commit/415bb7860fb3701b9dda448622307aeef1ebb565))
* configure schedule repositories ([#78](https://github.com/immich-app/yucca/issues/78)) ([6ef94e3](https://github.com/immich-app/yucca/commit/6ef94e355cdd0febc5b8d072163ee5faa256f090))
* device code flow ([#93](https://github.com/immich-app/yucca/issues/93)) ([aac9163](https://github.com/immich-app/yucca/commit/aac91631a9131d35319a87f4635bf6be078fd06a))
* Immich integration ([#65](https://github.com/immich-app/yucca/issues/65)) ([ccdcf37](https://github.com/immich-app/yucca/commit/ccdcf37ebb9966c50d833a98e6baeadecd2de736))
* immich integration (& assorted fixes) ([#77](https://github.com/immich-app/yucca/issues/77)) ([e57db5e](https://github.com/immich-app/yucca/commit/e57db5ef1972983b47c55cbdb077f5679eb689fc))
* immich integration UX ([#87](https://github.com/immich-app/yucca/issues/87)) ([b0d8f2c](https://github.com/immich-app/yucca/commit/b0d8f2c353e832f07cace6fbad2960c1bd2672c5))
* import repositories ([#59](https://github.com/immich-app/yucca/issues/59)) ([b9aafef](https://github.com/immich-app/yucca/commit/b9aafefc21bb3f94cf6f5a7254e0324af6f8cd9d))
* reconfigure primary repository backend ([#118](https://github.com/immich-app/yucca/issues/118)) ([10c0a3b](https://github.com/immich-app/yucca/commit/10c0a3b39ce3f005c38ffa95868556337cda0168))
* repository backend ([#49](https://github.com/immich-app/yucca/issues/49)) ([9b0d2e6](https://github.com/immich-app/yucca/commit/9b0d2e62e34537c24262f1ed76d0afb2dbc1a7e0))
* restore backups ([#62](https://github.com/immich-app/yucca/issues/62)) ([e11a654](https://github.com/immich-app/yucca/commit/e11a6546d306200f54ab02ef096d664142f59ae9))
* schedule database backups ([#58](https://github.com/immich-app/yucca/issues/58)) ([48e468d](https://github.com/immich-app/yucca/commit/48e468d69d571a8cde10edbc882b3615d9c798dd))
* sync metrics to customer API ([#84](https://github.com/immich-app/yucca/issues/84)) ([aa0a346](https://github.com/immich-app/yucca/commit/aa0a3464a8448631cf1b6894ff2a9ea5c30b7b72))
* yucca SDK ([#36](https://github.com/immich-app/yucca/issues/36)) ([957c3f8](https://github.com/immich-app/yucca/commit/957c3f8a6c28404e2c5920de6ab76cc59d03afca))
* **yucca sdk:** add authentication handoff ([#39](https://github.com/immich-app/yucca/issues/39)) ([e5981e7](https://github.com/immich-app/yucca/commit/e5981e71fc8bfa1388c2216e035fd49b41d936f4))
* **yucca sdk:** sqlite database for configuration ([#42](https://github.com/immich-app/yucca/issues/42)) ([e383fba](https://github.com/immich-app/yucca/commit/e383fbaea02312cd1426908d972618fa564efe52))


### Bug Fixes

* demo padding ([#103](https://github.com/immich-app/yucca/issues/103)) ([86fff0f](https://github.com/immich-app/yucca/commit/86fff0f42539717d57353d49c33009d851452e85))
* mark incomplete runs as failed on bootstrap ([#108](https://github.com/immich-app/yucca/issues/108)) ([3244657](https://github.com/immich-app/yucca/commit/32446577f8e80090a222e7ff956bc3dde8da53aa))
* redirect to / on login & un-delete migration ([#43](https://github.com/immich-app/yucca/issues/43)) ([6b11685](https://github.com/immich-app/yucca/commit/6b1168593d779ecdb7e5cfddf11e4d1c835f3e65))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @futo-org/backups-api-client bumped to 0.2.0
