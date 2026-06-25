# Changelog

## [0.5.0](https://github.com/immich-app/yucca/compare/v0.4.0...v0.5.0) (2026-06-25)


### Features

* **ci:** add kubeconfig / talosconfig to op ([#145](https://github.com/immich-app/yucca/issues/145)) ([fad10fd](https://github.com/immich-app/yucca/commit/fad10fdae9693ae2757cb3ab671c64700e5b3250))
* staging ([#135](https://github.com/immich-app/yucca/issues/135)) ([f700b18](https://github.com/immich-app/yucca/commit/f700b18cd6c9dd3a61fba59ff768b8fc1985da46))
* **staging:** wire in oidc ([#148](https://github.com/immich-app/yucca/issues/148)) ([7d5af45](https://github.com/immich-app/yucca/commit/7d5af4559f8f7c658b6d153c422bf893f3aa9398))


### Bug Fixes

* **ceph:** converge RGW S3 user to exactly the 1P key on rotation ([#159](https://github.com/immich-app/yucca/issues/159)) ([1cf742b](https://github.com/immich-app/yucca/commit/1cf742b0f4efa3cf7c9dc497c782cf2762ba0476))
* **ceph:** enforce dashboard admin password on every converge ([#154](https://github.com/immich-app/yucca/issues/154)) ([94e7b99](https://github.com/immich-app/yucca/commit/94e7b993fdff05d2cea3821fcd0948d426118ba5))
* **ceph:** enforce Grafana admin login password from the vault ([#157](https://github.com/immich-app/yucca/issues/157)) ([27ffe9d](https://github.com/immich-app/yucca/commit/27ffe9d1e7dab37b43a6eb7315c700abb45d2ad9))
* **ceph:** open cephadm service discovery port 8765 in firewall ([#156](https://github.com/immich-app/yucca/issues/156)) ([7eaa9e2](https://github.com/immich-app/yucca/commit/7eaa9e2993c7e543e2ef4e7d5d0ef7d03fd915d2))
* **ci:** adjust secret name ([#142](https://github.com/immich-app/yucca/issues/142)) ([a6eeb8b](https://github.com/immich-app/yucca/commit/a6eeb8bb67452e35b00d471da0ce0a645d08cbff))
* **ci:** fix secret not having write access ([#144](https://github.com/immich-app/yucca/issues/144)) ([02dab5b](https://github.com/immich-app/yucca/commit/02dab5bcc369b58bd7bb9dc6135fa2823ec16336))
* **ci:** op wrong secret field ([#143](https://github.com/immich-app/yucca/issues/143)) ([a4e1512](https://github.com/immich-app/yucca/commit/a4e15123be60ad868429647cbfe0b2d150fee25b))
* **staging:** a lot ([#147](https://github.com/immich-app/yucca/issues/147)) ([df65da6](https://github.com/immich-app/yucca/commit/df65da6f9272b0fd4fa7188e8291e471a70e110b))
* **staging:** correct vmauth url ([#153](https://github.com/immich-app/yucca/issues/153)) ([03e2802](https://github.com/immich-app/yucca/commit/03e2802c0647fa700da662f7c97c1a76f1e231f5))
* **staging:** missing quotes ([#150](https://github.com/immich-app/yucca/issues/150)) ([b03327f](https://github.com/immich-app/yucca/commit/b03327f7c767d30f823351b6bb7554c8a038bf75))
* **staging:** oidc unfun ([#151](https://github.com/immich-app/yucca/issues/151)) ([8f8be89](https://github.com/immich-app/yucca/commit/8f8be895926bb18193c22a58b69c7c40536dcabf))
* **staging:** set web port ([#152](https://github.com/immich-app/yucca/issues/152)) ([1736b7c](https://github.com/immich-app/yucca/commit/1736b7cd3adddb02a6975076f7582186b4155ae7))
* **staging:** something ([#149](https://github.com/immich-app/yucca/issues/149)) ([a92d39f](https://github.com/immich-app/yucca/commit/a92d39f4ec191375344420e7783689e0bb559ca5))
* **staging:** typo ([#146](https://github.com/immich-app/yucca/issues/146)) ([ff995bc](https://github.com/immich-app/yucca/commit/ff995bc59c7abcce4f0819973657ace9c1d7f173))
* **tf/ceph:** stop writing rendered inventories via local_file ([#155](https://github.com/immich-app/yucca/issues/155)) ([83dab28](https://github.com/immich-app/yucca/commit/83dab28c911fff05b5755097bba9bd8f0a73a42d))

## [0.4.0](https://github.com/immich-app/yucca/compare/v0.3.0...v0.4.0) (2026-06-19)


### Features

* telemetry & start up error reporting / robustness ([#132](https://github.com/immich-app/yucca/issues/132)) ([27d1ac1](https://github.com/immich-app/yucca/commit/27d1ac10c296d1e2ad2d86f883058ce26a566086))
* use .well-known/yucca.json to discover backend ([#126](https://github.com/immich-app/yucca/issues/126)) ([65b585a](https://github.com/immich-app/yucca/commit/65b585a435a59f40599c00206a0957b23ba5cb4a))

## [0.3.0](https://github.com/immich-app/yucca/compare/v0.2.0...v0.3.0) (2026-06-17)


### Features

* 'bytes stored' metric ([#45](https://github.com/immich-app/yucca/issues/45)) ([ce6b352](https://github.com/immich-app/yucca/commit/ce6b3529539d9c94095fd1888886b1c2f3de0e7c))
* admin API ([#106](https://github.com/immich-app/yucca/issues/106)) ([1f3ee2b](https://github.com/immich-app/yucca/commit/1f3ee2b5e62feb72b71d69a41cd07641b7f938ea))
* asymmetric jwt ([#91](https://github.com/immich-app/yucca/issues/91)) ([70fd11f](https://github.com/immich-app/yucca/commit/70fd11fb17f887801984f30959ad28c404053cdd))
* backup retention ([#89](https://github.com/immich-app/yucca/issues/89)) ([e703b08](https://github.com/immich-app/yucca/commit/e703b08b83e8e380284fcf8d178c079a253030c3))
* cancel running tasks (& node:fs repository refactor) ([#81](https://github.com/immich-app/yucca/issues/81)) ([415bb78](https://github.com/immich-app/yucca/commit/415bb7860fb3701b9dda448622307aeef1ebb565))
* **ceph:** import yucca-ceph ansible + terraform infrastructure ([#86](https://github.com/immich-app/yucca/issues/86)) ([63087f6](https://github.com/immich-app/yucca/commit/63087f68509b586ddead0e2c8a85d6819ad23e47))
* configure OpenTelemetry ([#29](https://github.com/immich-app/yucca/issues/29)) ([c568a50](https://github.com/immich-app/yucca/commit/c568a50687da78beb60e4ce65be3e080a2f35181))
* configure schedule repositories ([#78](https://github.com/immich-app/yucca/issues/78)) ([6ef94e3](https://github.com/immich-app/yucca/commit/6ef94e355cdd0febc5b8d072163ee5faa256f090))
* **customer API:** repository API ([#31](https://github.com/immich-app/yucca/issues/31)) ([6dee484](https://github.com/immich-app/yucca/commit/6dee4843d6ee2d41cfa3d219b2a1f6f97de2e7fb))
* **customer portal:** OIDC login ([#30](https://github.com/immich-app/yucca/issues/30)) ([2e288c2](https://github.com/immich-app/yucca/commit/2e288c2d0870a55d50dfd33c29913889a6c63990))
* device code flow ([#93](https://github.com/immich-app/yucca/issues/93)) ([aac9163](https://github.com/immich-app/yucca/commit/aac91631a9131d35319a87f4635bf6be078fd06a))
* **dns:** Cloudflare-managed DNS for futo.cloud ([#121](https://github.com/immich-app/yucca/issues/121)) ([b36f63f](https://github.com/immich-app/yucca/commit/b36f63f3f89652e41c56a385970b58bb2403137d))
* Dockerfile for michael ([#76](https://github.com/immich-app/yucca/issues/76)) ([9303cc1](https://github.com/immich-app/yucca/commit/9303cc1f794a78fcb2a50a6a3b5dd82781afb952))
* Immich integration ([#65](https://github.com/immich-app/yucca/issues/65)) ([ccdcf37](https://github.com/immich-app/yucca/commit/ccdcf37ebb9966c50d833a98e6baeadecd2de736))
* immich integration (& assorted fixes) ([#77](https://github.com/immich-app/yucca/issues/77)) ([e57db5e](https://github.com/immich-app/yucca/commit/e57db5ef1972983b47c55cbdb077f5679eb689fc))
* immich integration UX ([#87](https://github.com/immich-app/yucca/issues/87)) ([b0d8f2c](https://github.com/immich-app/yucca/commit/b0d8f2c353e832f07cace6fbad2960c1bd2672c5))
* import repositories ([#59](https://github.com/immich-app/yucca/issues/59)) ([b9aafef](https://github.com/immich-app/yucca/commit/b9aafefc21bb3f94cf6f5a7254e0324af6f8cd9d))
* initial commit ([#27](https://github.com/immich-app/yucca/issues/27)) ([0b99068](https://github.com/immich-app/yucca/commit/0b99068f236387a3974f9066fe78ec26931b28c2))
* key flow modal ([#44](https://github.com/immich-app/yucca/issues/44)) ([521c193](https://github.com/immich-app/yucca/commit/521c1931ec7eb571c23b99486bfc5e09c20cfed5))
* local k8s ([#85](https://github.com/immich-app/yucca/issues/85)) ([070e22a](https://github.com/immich-app/yucca/commit/070e22a7bb16fdfe506fa334547e173982a1462b))
* metrics worker (radosgw ingest) ([#123](https://github.com/immich-app/yucca/issues/123)) ([faa2880](https://github.com/immich-app/yucca/commit/faa288087d6ca48bc935d30a90a230886fd8737f))
* reconfigure primary repository backend ([#118](https://github.com/immich-app/yucca/issues/118)) ([10c0a3b](https://github.com/immich-app/yucca/commit/10c0a3b39ce3f005c38ffa95868556337cda0168))
* replace restic-api with michael ([#57](https://github.com/immich-app/yucca/issues/57)) ([4665f5c](https://github.com/immich-app/yucca/commit/4665f5cdd1dde16c141a8d400dfaaf86d2c3d5d0))
* repository backend ([#49](https://github.com/immich-app/yucca/issues/49)) ([9b0d2e6](https://github.com/immich-app/yucca/commit/9b0d2e62e34537c24262f1ed76d0afb2dbc1a7e0))
* restore backups ([#62](https://github.com/immich-app/yucca/issues/62)) ([e11a654](https://github.com/immich-app/yucca/commit/e11a6546d306200f54ab02ef096d664142f59ae9))
* schedule database backups ([#58](https://github.com/immich-app/yucca/issues/58)) ([48e468d](https://github.com/immich-app/yucca/commit/48e468d69d571a8cde10edbc882b3615d9c798dd))
* sync metrics to customer API ([#84](https://github.com/immich-app/yucca/issues/84)) ([aa0a346](https://github.com/immich-app/yucca/commit/aa0a3464a8448631cf1b6894ff2a9ea5c30b7b72))
* **talos:** hyper-converged Talos Kubernetes on the Sietch Ceph hosts ([#120](https://github.com/immich-app/yucca/issues/120)) ([30fdf6d](https://github.com/immich-app/yucca/commit/30fdf6da88ca952c86119da7812f440cdbb15b79))
* **yucca api:** configurable JWT expiry ([#80](https://github.com/immich-app/yucca/issues/80)) ([c64e90c](https://github.com/immich-app/yucca/commit/c64e90c7f158325a0eee82c86ac203990d2787be))
* yucca SDK ([#36](https://github.com/immich-app/yucca/issues/36)) ([957c3f8](https://github.com/immich-app/yucca/commit/957c3f8a6c28404e2c5920de6ab76cc59d03afca))
* **yucca sdk:** add authentication handoff ([#39](https://github.com/immich-app/yucca/issues/39)) ([e5981e7](https://github.com/immich-app/yucca/commit/e5981e71fc8bfa1388c2216e035fd49b41d936f4))
* **yucca sdk:** sqlite database for configuration ([#42](https://github.com/immich-app/yucca/issues/42)) ([e383fba](https://github.com/immich-app/yucca/commit/e383fbaea02312cd1426908d972618fa564efe52))


### Bug Fixes

* chunked uploads fail checksum checks ([#38](https://github.com/immich-app/yucca/issues/38)) ([c7f78f3](https://github.com/immich-app/yucca/commit/c7f78f3735412688f6f05869ecffa7623afc97f9))
* demo padding ([#103](https://github.com/immich-app/yucca/issues/103)) ([86fff0f](https://github.com/immich-app/yucca/commit/86fff0f42539717d57353d49c33009d851452e85))
* include `python3` in Nix flake, needed for Tilt ([#122](https://github.com/immich-app/yucca/issues/122)) ([fcecc8d](https://github.com/immich-app/yucca/commit/fcecc8dc2051d557fbc3955d2488ac782c1e02b5))
* mark incomplete runs as failed on bootstrap ([#108](https://github.com/immich-app/yucca/issues/108)) ([3244657](https://github.com/immich-app/yucca/commit/32446577f8e80090a222e7ff956bc3dde8da53aa))
* redirect to / on login & un-delete migration ([#43](https://github.com/immich-app/yucca/issues/43)) ([6b11685](https://github.com/immich-app/yucca/commit/6b1168593d779ecdb7e5cfddf11e4d1c835f3e65))
* use repo metrics as source of truth for immich integration card ([#79](https://github.com/immich-app/yucca/issues/79)) ([42635f4](https://github.com/immich-app/yucca/commit/42635f4c30fb848a129e46c7a368c35d170cc154))
