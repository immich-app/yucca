# Changelog

## [0.17.0](https://github.com/immich-app/yucca/compare/v0.16.1...v0.17.0) (2026-07-24)


### Features

* **ceph:** enable telemetry phone-home for transparency ([#316](https://github.com/immich-app/yucca/issues/316)) ([03d9bdd](https://github.com/immich-app/yucca/commit/03d9bdd4971bdc70f9cbd8992db57d86d020ef6b))


### Bug Fixes

* **admin:** correct oidc issuer url ([#321](https://github.com/immich-app/yucca/issues/321)) ([e1e5e6f](https://github.com/immich-app/yucca/commit/e1e5e6fa4deec85c6adeed6e7823f68f47825bc4))
* **ci:** fix ci so it works ([#323](https://github.com/immich-app/yucca/issues/323)) ([434df44](https://github.com/immich-app/yucca/commit/434df44ff85032921e656b013fe07f15b1808d63))
* **ci:** fix ci so it works ([#325](https://github.com/immich-app/yucca/issues/325)) ([28d386d](https://github.com/immich-app/yucca/commit/28d386d05d5dff740beb80255518f49fd8202100))
* **metrics-worker:** prevent infinite looping ([#326](https://github.com/immich-app/yucca/issues/326)) ([4028905](https://github.com/immich-app/yucca/commit/40289051ef04896f7fa6a7866dcd7d672d34b472))

## [0.16.1](https://github.com/immich-app/yucca/compare/v0.16.0...v0.16.1) (2026-07-24)


### Bug Fixes

* throw not found exception when item missing ([#318](https://github.com/immich-app/yucca/issues/318)) ([9b565eb](https://github.com/immich-app/yucca/commit/9b565ebe1f98d780df324f020f3c1b5d8ba81d20))

## [0.16.0](https://github.com/immich-app/yucca/compare/v0.15.1...v0.16.0) (2026-07-23)


### Features

* **admin:** wire up admin ([#313](https://github.com/immich-app/yucca/issues/313)) ([8afa305](https://github.com/immich-app/yucca/commit/8afa3059eee5bd1d9c963c2017ad7c80f4ba159a))
* **o11y:** ship dashboards as a signed OCI manifest bundle ([#315](https://github.com/immich-app/yucca/issues/315)) ([37e8b2f](https://github.com/immich-app/yucca/commit/37e8b2fc94d9865d2cc89b71302d2299e7d1d915))

## [0.15.1](https://github.com/immich-app/yucca/compare/v0.15.0...v0.15.1) (2026-07-23)


### Bug Fixes

* **ci:** change bumping workflow ([#311](https://github.com/immich-app/yucca/issues/311)) ([c938fc3](https://github.com/immich-app/yucca/commit/c938fc379a072fe76e533d9ed9a0632b793b22ed))

## [0.15.0](https://github.com/immich-app/yucca/compare/v0.14.1...v0.15.0) (2026-07-23)


### Features

* **yucca sdk:** hooks for creating db dump & performing rollback ([#309](https://github.com/immich-app/yucca/issues/309)) ([4cbdde3](https://github.com/immich-app/yucca/commit/4cbdde3ac506c64a5993094cf3d1428b1d1086a3))

## [0.14.1](https://github.com/immich-app/yucca/compare/v0.14.0...v0.14.1) (2026-07-22)


### Bug Fixes

* **mgmt:** vlan interface names exceeded IFNAMSIZ ([#305](https://github.com/immich-app/yucca/issues/305)) ([9a7b72d](https://github.com/immich-app/yucca/commit/9a7b72d89cd799695ca2e667064d70cb7aad4e8f))

## [0.14.0](https://github.com/immich-app/yucca/compare/v0.13.1...v0.14.0) (2026-07-22)


### Features

* **ceph:** passwordless ops sudo on sietch and spice ([#299](https://github.com/immich-app/yucca/issues/299)) ([526bbfc](https://github.com/immich-app/yucca/commit/526bbfcca565429031bc64526ba592c700860ea7))


### Bug Fixes

* **michael:** paginate on more than 1000 objects ([#304](https://github.com/immich-app/yucca/issues/304)) ([37e603c](https://github.com/immich-app/yucca/commit/37e603c9df94169c1557e2bfc3fce85467434105))

## [0.13.1](https://github.com/immich-app/yucca/compare/v0.13.0...v0.13.1) (2026-07-22)


### Bug Fixes

* **michael:** better load balancer initialization ([#297](https://github.com/immich-app/yucca/issues/297)) ([55ccf7d](https://github.com/immich-app/yucca/commit/55ccf7df26cd77db4d0a52721a2a04148df6e65a))

## [0.13.0](https://github.com/immich-app/yucca/compare/v0.12.0...v0.13.0) (2026-07-22)


### Features

* **yucca sdk:** pin rest connections to 'availableParallelism' ([#264](https://github.com/immich-app/yucca/issues/264)) ([6f88b57](https://github.com/immich-app/yucca/commit/6f88b578f54833966483b89e1ce0c02d7c1badf2))

## [0.12.0](https://github.com/immich-app/yucca/compare/v0.11.0...v0.12.0) (2026-07-22)


### Features

* **ceph:** netbird ssh server for spice (sso-gated human access) ([#290](https://github.com/immich-app/yucca/issues/290)) ([b2d49cc](https://github.com/immich-app/yucca/commit/b2d49cce467554cb4b65f272a4cd65c19e7bf691))
* **o11y:** more better monitoring ([#291](https://github.com/immich-app/yucca/issues/291)) ([cc2e1f4](https://github.com/immich-app/yucca/commit/cc2e1f471eb00abd1326d4287abfff36740e1418))
* **o11y:** oci dashboards ([#294](https://github.com/immich-app/yucca/issues/294)) ([c5f827e](https://github.com/immich-app/yucca/commit/c5f827e76c1a4bb1f54e3c599fec90e203badd80))
* **o11y:** shared crossair, no fill, legend ordering ([#295](https://github.com/immich-app/yucca/issues/295)) ([832c73e](https://github.com/immich-app/yucca/commit/832c73e7651e52cc9fa83f8c4f2ce3324c544d9f))


### Bug Fixes

* **o11y:** wrong labels ([#293](https://github.com/immich-app/yucca/issues/293)) ([522630f](https://github.com/immich-app/yucca/commit/522630fec0e8afa4ba47f4424aacc8e1d1fdfe98))

## [0.11.0](https://github.com/immich-app/yucca/compare/v0.10.0...v0.11.0) (2026-07-22)


### Features

* **all:** introduce partition/region/ceph-cluster model across the stack ([#222](https://github.com/immich-app/yucca/issues/222)) ([c6985d9](https://github.com/immich-app/yucca/commit/c6985d902c8cc84c130c4d591ec6c2131160e4a9))
* **bgp:** stand up bgp ([#224](https://github.com/immich-app/yucca/issues/224)) ([aeee19e](https://github.com/immich-app/yucca/commit/aeee19e336786ed2ed8136938ae2104f6c498cb4))
* **ceph:** netbird enrollment role for the spice nodes ([#287](https://github.com/immich-app/yucca/issues/287)) ([2881be6](https://github.com/immich-app/yucca/commit/2881be69a4b63e9fb517941ed0447248fd16fe4b))
* **ceph:** prod spice cluster on htz-fsn1 ([#256](https://github.com/immich-app/yucca/issues/256)) ([0357aac](https://github.com/immich-app/yucca/commit/0357aac743b4e24745f9ad9dfddcdef7a8f3cd03))
* **ceph:** re-add noreen to spice ([#273](https://github.com/immich-app/yucca/issues/273)) ([0c923c8](https://github.com/immich-app/yucca/commit/0c923c854617a39cfd2f06da3fbfbb3ad9a60e31))
* **ceph:** trust the netbird overlay interface in nftables ([#285](https://github.com/immich-app/yucca/issues/285)) ([4782ef8](https://github.com/immich-app/yucca/commit/4782ef8d69a089a4542319841228e3f4f3f637a5))
* **claude:** first CLAUDE.md ([#226](https://github.com/immich-app/yucca/issues/226)) ([745bf59](https://github.com/immich-app/yucca/commit/745bf5970e9490912effc886b753027cfbb36c9f))
* **fabric:** management plane on a per cluster basis ([#240](https://github.com/immich-app/yucca/issues/240)) ([baae250](https://github.com/immich-app/yucca/commit/baae250f76a58289ce3a33353d8bca795deb72b5))
* **k8s:** cluster naming ([#243](https://github.com/immich-app/yucca/issues/243)) ([254b7a4](https://github.com/immich-app/yucca/commit/254b7a4b49a5199dbec833d216564ca668a2d8d2))
* **netbird-ansible:** better subnet routers ([#217](https://github.com/immich-app/yucca/issues/217)) ([e039026](https://github.com/immich-app/yucca/commit/e039026cbeb72ebfbd274196788dfd08317afe21))
* **netbird:** ceph peer group, setup key, and CI ssh policy ([#286](https://github.com/immich-app/yucca/issues/286)) ([12b46f5](https://github.com/immich-app/yucca/commit/12b46f582d7d107cf723c65dee757ab1d0238028))
* **netbird:** k8s ([#218](https://github.com/immich-app/yucca/issues/218)) ([0ec09f0](https://github.com/immich-app/yucca/commit/0ec09f022a85ea4ecd6e9548f80cf096f601fb2c))
* **prod:** add mgmt-1 to terraform ownership (bye tailscale) ([#230](https://github.com/immich-app/yucca/issues/230)) ([f75cc90](https://github.com/immich-app/yucca/commit/f75cc90cf9429fc295bd8e025717016edeff4a07))
* **prod:** continue prod ([#267](https://github.com/immich-app/yucca/issues/267)) ([1f9b84b](https://github.com/immich-app/yucca/commit/1f9b84bb1d294f29a60187f494733615f4d39508))
* **prod:** continue prod ([#288](https://github.com/immich-app/yucca/issues/288)) ([114904e](https://github.com/immich-app/yucca/commit/114904e9662eba00cd0cacb590c4b5ddea8b8536))
* **prod:** deploy prod apps ([#284](https://github.com/immich-app/yucca/issues/284)) ([bd74b16](https://github.com/immich-app/yucca/commit/bd74b16c7c95e5fac6a94e143eed814c0a9d4a13))
* **prod:** prod ([#247](https://github.com/immich-app/yucca/issues/247)) ([963364a](https://github.com/immich-app/yucca/commit/963364a034b847149a6ce0570a6a6f5f5ccf82e2))
* **yucca:** add full e2e mgmt provisioning maybe ([#182](https://github.com/immich-app/yucca/issues/182)) ([481c5e9](https://github.com/immich-app/yucca/commit/481c5e920a289c5dc09d4a7c147a962044e8a852))


### Bug Fixes

* **ceph:** flush handlers after the sshd kex workaround ([#276](https://github.com/immich-app/yucca/issues/276)) ([879b8d3](https://github.com/immich-app/yucca/commit/879b8d3e09592087bdeb4f73650b6dd1eeb37696))
* **ceph:** keep established flows alive through firewall activation ([#275](https://github.com/immich-app/yucca/issues/275)) ([158ca39](https://github.com/immich-app/yucca/commit/158ca39731fa12a7f93bca3611ef53b6f326eeba))
* **ceph:** mask periodic apt and refresh cache after repo changes ([#271](https://github.com/immich-app/yucca/issues/271)) ([9f1bb2f](https://github.com/immich-app/yucca/commit/9f1bb2f25a22e176a3219de6b2e7bd9f97d931ad))
* **ceph:** parenthesize the ceph-safety verdict ternary ([#272](https://github.com/immich-app/yucca/issues/272)) ([f24f0f3](https://github.com/immich-app/yucca/commit/f24f0f38a988a2eaa3a1072448b67a53b480911b))
* **ceph:** pin mtu-less VLAN sub-interfaces to 1500 ([#274](https://github.com/immich-app/yucca/issues/274)) ([9f3bea6](https://github.com/immich-app/yucca/commit/9f3bea6987f5d2dd5679e015c4ecaf13f5b1acbc))
* **ceph:** render inventories with the partition's op env file ([#270](https://github.com/immich-app/yucca/issues/270)) ([21f6cdb](https://github.com/immich-app/yucca/commit/21f6cdbb4e20b073caf76bb35f254892938030cd))
* **ceph:** seed the grafana admin and provision dashboards from the repo ([#283](https://github.com/immich-app/yucca/issues/283)) ([017da30](https://github.com/immich-app/yucca/commit/017da30a6e9af546bfda2ac6ca868693c3441822))
* **ci:** apply prettier formatting ([#225](https://github.com/immich-app/yucca/issues/225)) ([4cf9ac0](https://github.com/immich-app/yucca/commit/4cf9ac0a8338866cabb0b9f3770a098296f7f20c))
* **fabric:** depends_on ([#246](https://github.com/immich-app/yucca/issues/246)) ([789e036](https://github.com/immich-app/yucca/commit/789e0361c5dfe50ce4aa9c3870ec9e6466d506a9))
* **fabric:** fix fabric deployment ([#228](https://github.com/immich-app/yucca/issues/228)) ([f78ba50](https://github.com/immich-app/yucca/commit/f78ba50ebc5288cedc73a5efb38c1f005de35e3a))
* **fabric:** unhinged fix to duplicate config blocks because this is entirely spaget ([#229](https://github.com/immich-app/yucca/issues/229)) ([ceba1f0](https://github.com/immich-app/yucca/commit/ceba1f0eef3070e3186be197d32e7407c03de8ca))
* **flux:** branch ref ([#255](https://github.com/immich-app/yucca/issues/255)) ([3427483](https://github.com/immich-app/yucca/commit/3427483e5d2fdcd66174253df01e4e19b4903e53))
* **kube:** move to local volumes ([#241](https://github.com/immich-app/yucca/issues/241)) ([e00ea72](https://github.com/immich-app/yucca/commit/e00ea72a21f8c26fb91469b18c2ceae29f278939))
* **netbird:** add netbird network to trusted list ([#219](https://github.com/immich-app/yucca/issues/219)) ([4033cc2](https://github.com/immich-app/yucca/commit/4033cc2d97424eb5e7295aa677e2812c72de51e3))
* **netbird:** comment in the things ([#221](https://github.com/immich-app/yucca/issues/221)) ([54c410f](https://github.com/immich-app/yucca/commit/54c410f59c3e502bafbe522018256c23ddeff79a))
* **netbird:** comment out lines ([#220](https://github.com/immich-app/yucca/issues/220)) ([a6235d7](https://github.com/immich-app/yucca/commit/a6235d77edcc0a00de8fd916b6cbf8179075b7e4))
* **netbird:** make mutating webhook not go boom ([#244](https://github.com/immich-app/yucca/issues/244)) ([7858d73](https://github.com/immich-app/yucca/commit/7858d7318d1e3f2f515cc61affc604040f937886))
* **netbird:** policies ([#239](https://github.com/immich-app/yucca/issues/239)) ([012db81](https://github.com/immich-app/yucca/commit/012db81704781957e29898ca2f036787721e86c6))
* **netbird:** restore the talos plan's NetBird connect (revert -refre… ([#215](https://github.com/immich-app/yucca/issues/215)) ([8474098](https://github.com/immich-app/yucca/commit/847409819fd476c9f2adb9c93be78a790ce98780))
* **netbird:** restore the talos plan's NetBird connect (revert -refresh=false) ([8474098](https://github.com/immich-app/yucca/commit/847409819fd476c9f2adb9c93be78a790ce98780))
* **netbird:** some issues ([#212](https://github.com/immich-app/yucca/issues/212)) ([948b15c](https://github.com/immich-app/yucca/commit/948b15cf0bf9f46705db14803c9151bdbaf9595f))
* **netbird:** take explicit group-name overrides verbatim([#216](https://github.com/immich-app/yucca/issues/216)) ([00421f3](https://github.com/immich-app/yucca/commit/00421f33ecdd6460d28bd37ae4f9e78ca9e53027))
* **talos:** drop stale luke CP re-key migration ([#257](https://github.com/immich-app/yucca/issues/257)) ([26b58fe](https://github.com/immich-app/yucca/commit/26b58feb154843cfd1bd0794b12a53aba66c94ad))
* **talos:** drop stale luke CP re-key migration (state already address-keyed) ([26b58fe](https://github.com/immich-app/yucca/commit/26b58feb154843cfd1bd0794b12a53aba66c94ad))
* **typo:** fix typo ([#245](https://github.com/immich-app/yucca/issues/245)) ([9ad33c4](https://github.com/immich-app/yucca/commit/9ad33c444d80fcc43a13ea2453b74f66a03ba4c9))
* **workflow:** gate ansible workflows ([#227](https://github.com/immich-app/yucca/issues/227)) ([b723285](https://github.com/immich-app/yucca/commit/b72328562604b254a57a2155499411a165b38c12))
* **workflow:** missing working directory ([#223](https://github.com/immich-app/yucca/issues/223)) ([48c6220](https://github.com/immich-app/yucca/commit/48c62208941f0bfc5ce18ca949a08ef9db6af05f))

## [0.10.0](https://github.com/immich-app/yucca/compare/v0.9.1...v0.10.0) (2026-06-26)


### Features

* **netbird:** wire this sweetie up ([#209](https://github.com/immich-app/yucca/issues/209)) ([031974a](https://github.com/immich-app/yucca/commit/031974a32b442b5f515014683406eafadbdeedaa))


### Bug Fixes

* invert restore snapshot disabled check ([#211](https://github.com/immich-app/yucca/issues/211)) ([a6146e9](https://github.com/immich-app/yucca/commit/a6146e9b73dd42168f829062af28fd705165a9ff))

## [0.9.1](https://github.com/immich-app/yucca/compare/v0.9.0...v0.9.1) (2026-06-26)


### Bug Fixes

* **ceph:** reload nftables only when the live ruleset differs ([#206](https://github.com/immich-app/yucca/issues/206)) ([f0dd618](https://github.com/immich-app/yucca/commit/f0dd618119333ef83366dbcecf1abe164b4ba5ce))

## [0.9.0](https://github.com/immich-app/yucca/compare/v0.8.0...v0.9.0) (2026-06-26)


### Features

* **ansible:** change ([#202](https://github.com/immich-app/yucca/issues/202)) ([f49cf82](https://github.com/immich-app/yucca/commit/f49cf82079f26d9c76e6ee71e8c580d842488f0e))
* **ansible:** make it go brrr in ci ([#200](https://github.com/immich-app/yucca/issues/200)) ([97b4514](https://github.com/immich-app/yucca/commit/97b451464498a22a78270317b680fdc1697e6082))
* **ceph:** add read-only metrics-worker RGW admin user + keys ([#188](https://github.com/immich-app/yucca/issues/188)) ([983e061](https://github.com/immich-app/yucca/commit/983e061d01cb051c7fd4cf0c3359b7ef6d257cee))
* **k8s:** wire in flux notifications-controller for commit statuses ([#195](https://github.com/immich-app/yucca/issues/195)) ([82f8f44](https://github.com/immich-app/yucca/commit/82f8f44a97b73051f7350813dedb008f09d77802))
* **staging:** wire in metrics-worker ([#181](https://github.com/immich-app/yucca/issues/181)) ([5d97a0f](https://github.com/immich-app/yucca/commit/5d97a0fd04aa79cad588abf2ecb6fee7eb21f89f))


### Bug Fixes

* **ansible:** add missing deps ([#204](https://github.com/immich-app/yucca/issues/204)) ([05bb52e](https://github.com/immich-app/yucca/commit/05bb52e7506289e9a61623598f99d887fba16f24))
* device code flow maybe ([#158](https://github.com/immich-app/yucca/issues/158)) ([ec75076](https://github.com/immich-app/yucca/commit/ec750767a34a378433319282d8ce81ae14c5f573))
* **michael:** remove duplicate s3 env vars ([#194](https://github.com/immich-app/yucca/issues/194)) ([fa1683c](https://github.com/immich-app/yucca/commit/fa1683c9c6c7881259170b4140476b28f3ee9555))
* **yucca-api:** good secret name ([#198](https://github.com/immich-app/yucca/issues/198)) ([deed0ba](https://github.com/immich-app/yucca/commit/deed0ba505796e1279282d9cf9bc76c54b3adff5))
* **yucca:** correct vault for vmwauth ([9f7b94b](https://github.com/immich-app/yucca/commit/9f7b94b5fb25d92fff10c3ff6c1fab29b7b41416))

## [0.8.0](https://github.com/immich-app/yucca/compare/v0.7.0...v0.8.0) (2026-06-26)


### Features

* 'bytes stored' metric ([#45](https://github.com/immich-app/yucca/issues/45)) ([ce6b352](https://github.com/immich-app/yucca/commit/ce6b3529539d9c94095fd1888886b1c2f3de0e7c))
* admin API ([#106](https://github.com/immich-app/yucca/issues/106)) ([1f3ee2b](https://github.com/immich-app/yucca/commit/1f3ee2b5e62feb72b71d69a41cd07641b7f938ea))
* asymmetric jwt ([#91](https://github.com/immich-app/yucca/issues/91)) ([70fd11f](https://github.com/immich-app/yucca/commit/70fd11fb17f887801984f30959ad28c404053cdd))
* backup retention ([#89](https://github.com/immich-app/yucca/issues/89)) ([e703b08](https://github.com/immich-app/yucca/commit/e703b08b83e8e380284fcf8d178c079a253030c3))
* cancel running tasks (& node:fs repository refactor) ([#81](https://github.com/immich-app/yucca/issues/81)) ([415bb78](https://github.com/immich-app/yucca/commit/415bb7860fb3701b9dda448622307aeef1ebb565))
* **ceph:** add LV-based SSD OSD tier for sietch ([#184](https://github.com/immich-app/yucca/issues/184)) ([5af389f](https://github.com/immich-app/yucca/commit/5af389f1885abe7e8a752c71153594bb61b9c1c1))
* **ceph:** add sietch staging ansible inventory ([#166](https://github.com/immich-app/yucca/issues/166)) ([ecd28e4](https://github.com/immich-app/yucca/commit/ecd28e4beb0371ede006f254a134b3f8e792173e))
* **ceph:** add staging/ceph terraform stack ([#165](https://github.com/immich-app/yucca/issues/165)) ([8d5bb53](https://github.com/immich-app/yucca/commit/8d5bb532e37d38b4566488733f81a8c1b4d8bb6a))
* **ceph:** authorize ops SSH keys from the identity registry ([#174](https://github.com/immich-app/yucca/issues/174)) ([8618de8](https://github.com/immich-app/yucca/commit/8618de88640571cf9467f2b44d43ea6b7093dea5))
* **ceph:** import yucca-ceph ansible + terraform infrastructure ([#86](https://github.com/immich-app/yucca/issues/86)) ([63087f6](https://github.com/immich-app/yucca/commit/63087f68509b586ddead0e2c8a85d6819ad23e47))
* **ceph:** optional OSD-disk wipe in provision (clean rebuild) ([#177](https://github.com/immich-app/yucca/issues/177)) ([66740a7](https://github.com/immich-app/yucca/commit/66740a73982f9e78c7c46d284f67825e66c6cff1))
* **ceph:** per-role password length, shorter ops ([#172](https://github.com/immich-app/yucca/issues/172)) ([9c33f90](https://github.com/immich-app/yucca/commit/9c33f90e9e64ba85dd98506dc9e875611b73e53c))
* **ceph:** support per-cluster baseline packages ([#169](https://github.com/immich-app/yucca/issues/169)) ([86cbe06](https://github.com/immich-app/yucca/commit/86cbe06bc34b2387805cb3a4b49c638a8af99a10))
* **ci:** add kubeconfig / talosconfig to op ([#145](https://github.com/immich-app/yucca/issues/145)) ([fad10fd](https://github.com/immich-app/yucca/commit/fad10fdae9693ae2757cb3ab671c64700e5b3250))
* configure OpenTelemetry ([#29](https://github.com/immich-app/yucca/issues/29)) ([c568a50](https://github.com/immich-app/yucca/commit/c568a50687da78beb60e4ce65be3e080a2f35181))
* configure schedule repositories ([#78](https://github.com/immich-app/yucca/issues/78)) ([6ef94e3](https://github.com/immich-app/yucca/commit/6ef94e355cdd0febc5b8d072163ee5faa256f090))
* **customer API:** repository API ([#31](https://github.com/immich-app/yucca/issues/31)) ([6dee484](https://github.com/immich-app/yucca/commit/6dee4843d6ee2d41cfa3d219b2a1f6f97de2e7fb))
* **customer portal:** OIDC login ([#30](https://github.com/immich-app/yucca/issues/30)) ([2e288c2](https://github.com/immich-app/yucca/commit/2e288c2d0870a55d50dfd33c29913889a6c63990))
* device code flow ([#93](https://github.com/immich-app/yucca/issues/93)) ([aac9163](https://github.com/immich-app/yucca/commit/aac91631a9131d35319a87f4635bf6be078fd06a))
* **dns:** add s3.staging.austin RGW records for sietch ([#167](https://github.com/immich-app/yucca/issues/167)) ([9562a46](https://github.com/immich-app/yucca/commit/9562a46b25e765ad1a615958be80339d7a5ffac6))
* **dns:** Cloudflare-managed DNS for futo.cloud ([#121](https://github.com/immich-app/yucca/issues/121)) ([b36f63f](https://github.com/immich-app/yucca/commit/b36f63f3f89652e41c56a385970b58bb2403137d))
* Dockerfile for michael ([#76](https://github.com/immich-app/yucca/issues/76)) ([9303cc1](https://github.com/immich-app/yucca/commit/9303cc1f794a78fcb2a50a6a3b5dd82781afb952))
* fabric terraform ([#170](https://github.com/immich-app/yucca/issues/170)) ([80d15f2](https://github.com/immich-app/yucca/commit/80d15f23afadf0116f958e60db2bd74f33989d03))
* Immich integration ([#65](https://github.com/immich-app/yucca/issues/65)) ([ccdcf37](https://github.com/immich-app/yucca/commit/ccdcf37ebb9966c50d833a98e6baeadecd2de736))
* immich integration (& assorted fixes) ([#77](https://github.com/immich-app/yucca/issues/77)) ([e57db5e](https://github.com/immich-app/yucca/commit/e57db5ef1972983b47c55cbdb077f5679eb689fc))
* immich integration UX ([#87](https://github.com/immich-app/yucca/issues/87)) ([b0d8f2c](https://github.com/immich-app/yucca/commit/b0d8f2c353e832f07cace6fbad2960c1bd2672c5))
* import repositories ([#59](https://github.com/immich-app/yucca/issues/59)) ([b9aafef](https://github.com/immich-app/yucca/commit/b9aafefc21bb3f94cf6f5a7254e0324af6f8cd9d))
* initial commit ([#27](https://github.com/immich-app/yucca/issues/27)) ([0b99068](https://github.com/immich-app/yucca/commit/0b99068f236387a3974f9066fe78ec26931b28c2))
* **k8s:** point michael at the staging RGW endpoint ([#185](https://github.com/immich-app/yucca/issues/185)) ([3815637](https://github.com/immich-app/yucca/commit/3815637b500f0b7f2554c75fc98d79dbe9224a07))
* key flow modal ([#44](https://github.com/immich-app/yucca/issues/44)) ([521c193](https://github.com/immich-app/yucca/commit/521c1931ec7eb571c23b99486bfc5e09c20cfed5))
* local k8s ([#85](https://github.com/immich-app/yucca/issues/85)) ([070e22a](https://github.com/immich-app/yucca/commit/070e22a7bb16fdfe506fa334547e173982a1462b))
* metrics worker (radosgw ingest) ([#123](https://github.com/immich-app/yucca/issues/123)) ([faa2880](https://github.com/immich-app/yucca/commit/faa288087d6ca48bc935d30a90a230886fd8737f))
* **michael:** make michael also do load balancing since he's not too… ([#179](https://github.com/immich-app/yucca/issues/179)) ([065ff3d](https://github.com/immich-app/yucca/commit/065ff3d308cda981f8a0bc936115d7093a4201cd))
* more fabric things!! ([#171](https://github.com/immich-app/yucca/issues/171)) ([a6802df](https://github.com/immich-app/yucca/commit/a6802df749ef5417f32bf66a4abd50cd92232bf6))
* reconfigure primary repository backend ([#118](https://github.com/immich-app/yucca/issues/118)) ([10c0a3b](https://github.com/immich-app/yucca/commit/10c0a3b39ce3f005c38ffa95868556337cda0168))
* replace restic-api with michael ([#57](https://github.com/immich-app/yucca/issues/57)) ([4665f5c](https://github.com/immich-app/yucca/commit/4665f5cdd1dde16c141a8d400dfaaf86d2c3d5d0))
* repository backend ([#49](https://github.com/immich-app/yucca/issues/49)) ([9b0d2e6](https://github.com/immich-app/yucca/commit/9b0d2e62e34537c24262f1ed76d0afb2dbc1a7e0))
* restore backups ([#62](https://github.com/immich-app/yucca/issues/62)) ([e11a654](https://github.com/immich-app/yucca/commit/e11a6546d306200f54ab02ef096d664142f59ae9))
* schedule database backups ([#58](https://github.com/immich-app/yucca/issues/58)) ([48e468d](https://github.com/immich-app/yucca/commit/48e468d69d571a8cde10edbc882b3615d9c798dd))
* staging ([#135](https://github.com/immich-app/yucca/issues/135)) ([f700b18](https://github.com/immich-app/yucca/commit/f700b18cd6c9dd3a61fba59ff768b8fc1985da46))
* **staging:** normalize logs ([#164](https://github.com/immich-app/yucca/issues/164)) ([bc8136d](https://github.com/immich-app/yucca/commit/bc8136def5d875186af28cc2ddb00eae5f192243))
* **staging:** wire in oidc ([#148](https://github.com/immich-app/yucca/issues/148)) ([7d5af45](https://github.com/immich-app/yucca/commit/7d5af4559f8f7c658b6d153c422bf893f3aa9398))
* sync metrics to customer API ([#84](https://github.com/immich-app/yucca/issues/84)) ([aa0a346](https://github.com/immich-app/yucca/commit/aa0a3464a8448631cf1b6894ff2a9ea5c30b7b72))
* **talos:** hyper-converged Talos Kubernetes on the Sietch Ceph hosts ([#120](https://github.com/immich-app/yucca/issues/120)) ([30fdf6d](https://github.com/immich-app/yucca/commit/30fdf6da88ca952c86119da7812f440cdbb15b79))
* telemetry & start up error reporting / robustness ([#132](https://github.com/immich-app/yucca/issues/132)) ([27d1ac1](https://github.com/immich-app/yucca/commit/27d1ac10c296d1e2ad2d86f883058ce26a566086))
* use .well-known/yucca.json to discover backend ([#126](https://github.com/immich-app/yucca/issues/126)) ([65b585a](https://github.com/immich-app/yucca/commit/65b585a435a59f40599c00206a0957b23ba5cb4a))
* **yucca api:** configurable JWT expiry ([#80](https://github.com/immich-app/yucca/issues/80)) ([c64e90c](https://github.com/immich-app/yucca/commit/c64e90c7f158325a0eee82c86ac203990d2787be))
* yucca SDK ([#36](https://github.com/immich-app/yucca/issues/36)) ([957c3f8](https://github.com/immich-app/yucca/commit/957c3f8a6c28404e2c5920de6ab76cc59d03afca))
* **yucca sdk:** add authentication handoff ([#39](https://github.com/immich-app/yucca/issues/39)) ([e5981e7](https://github.com/immich-app/yucca/commit/e5981e71fc8bfa1388c2216e035fd49b41d936f4))
* **yucca sdk:** sqlite database for configuration ([#42](https://github.com/immich-app/yucca/issues/42)) ([e383fba](https://github.com/immich-app/yucca/commit/e383fbaea02312cd1426908d972618fa564efe52))


### Bug Fixes

* add package metadata for provenance ([#130](https://github.com/immich-app/yucca/issues/130)) ([64b5fa7](https://github.com/immich-app/yucca/commit/64b5fa78970d38abc683bf63d8e79ed1087b7c81))
* **ceph:** converge RGW S3 user to exactly the 1P key on rotation ([#159](https://github.com/immich-app/yucca/issues/159)) ([1cf742b](https://github.com/immich-app/yucca/commit/1cf742b0f4efa3cf7c9dc497c782cf2762ba0476))
* **ceph:** enforce dashboard admin password on every converge ([#154](https://github.com/immich-app/yucca/issues/154)) ([94e7b99](https://github.com/immich-app/yucca/commit/94e7b993fdff05d2cea3821fcd0948d426118ba5))
* **ceph:** enforce Grafana admin login password from the vault ([#157](https://github.com/immich-app/yucca/issues/157)) ([27ffe9d](https://github.com/immich-app/yucca/commit/27ffe9d1e7dab37b43a6eb7315c700abb45d2ad9))
* **ceph:** harden deploy-ceph for from-scratch reimage ([#183](https://github.com/immich-app/yucca/issues/183)) ([f82728c](https://github.com/immich-app/yucca/commit/f82728cc98f9715315b67668d8a615bda301c5e4))
* **ceph:** open cephadm service discovery port 8765 in firewall ([#156](https://github.com/immich-app/yucca/issues/156)) ([7eaa9e2](https://github.com/immich-app/yucca/commit/7eaa9e2993c7e543e2ef4e7d5d0ef7d03fd915d2))
* **ceph:** parameterize secrets vault for non-dev clusters ([#163](https://github.com/immich-app/yucca/issues/163)) ([0794082](https://github.com/immich-app/yucca/commit/07940827710ea641c7df8b178d9a2e23f23d5143))
* **ceph:** use --force-password for dashboard password on Tentacle ([#178](https://github.com/immich-app/yucca/issues/178)) ([3d52829](https://github.com/immich-app/yucca/commit/3d52829f19066194b5023f8e12ec54e982b2062f))
* chunked uploads fail checksum checks ([#38](https://github.com/immich-app/yucca/issues/38)) ([c7f78f3](https://github.com/immich-app/yucca/commit/c7f78f3735412688f6f05869ecffa7623afc97f9))
* **ci:** adjust secret name ([#142](https://github.com/immich-app/yucca/issues/142)) ([a6eeb8b](https://github.com/immich-app/yucca/commit/a6eeb8bb67452e35b00d471da0ce0a645d08cbff))
* **ci:** fix secret not having write access ([#144](https://github.com/immich-app/yucca/issues/144)) ([02dab5b](https://github.com/immich-app/yucca/commit/02dab5bcc369b58bd7bb9dc6135fa2823ec16336))
* **ci:** op wrong secret field ([#143](https://github.com/immich-app/yucca/issues/143)) ([a4e1512](https://github.com/immich-app/yucca/commit/a4e15123be60ad868429647cbfe0b2d150fee25b))
* demo padding ([#103](https://github.com/immich-app/yucca/issues/103)) ([86fff0f](https://github.com/immich-app/yucca/commit/86fff0f42539717d57353d49c33009d851452e85))
* **deps:** update module github.com/aws/aws-sdk-go-v2/service/s3 to v1.97.3 [security] ([#69](https://github.com/immich-app/yucca/issues/69)) ([489d28c](https://github.com/immich-app/yucca/commit/489d28c892538da126ba04d47cf42c597ad7bb20))
* **fabic:** a lot of custom stuff there ([#180](https://github.com/immich-app/yucca/issues/180)) ([9b39abf](https://github.com/immich-app/yucca/commit/9b39abfd6a5e8924ee849bb52087c561707df9f4))
* fabric stuff ([#173](https://github.com/immich-app/yucca/issues/173)) ([6d4056d](https://github.com/immich-app/yucca/commit/6d4056dffdb2822d9e13281603470df6bcb8cd79))
* include `python3` in Nix flake, needed for Tilt ([#122](https://github.com/immich-app/yucca/issues/122)) ([fcecc8d](https://github.com/immich-app/yucca/commit/fcecc8dc2051d557fbc3955d2488ac782c1e02b5))
* mark incomplete runs as failed on bootstrap ([#108](https://github.com/immich-app/yucca/issues/108)) ([3244657](https://github.com/immich-app/yucca/commit/32446577f8e80090a222e7ff956bc3dde8da53aa))
* missing GatewayEvent export ([#162](https://github.com/immich-app/yucca/issues/162)) ([1d94beb](https://github.com/immich-app/yucca/commit/1d94bebcdcff24a11d7605b07a90f9102dd3451b))
* package imports for orchestrator api ([#160](https://github.com/immich-app/yucca/issues/160)) ([4956b51](https://github.com/immich-app/yucca/commit/4956b5105bc55f79116af0edcc1136ce00b72e2b))
* redirect to / on login & un-delete migration ([#43](https://github.com/immich-app/yucca/issues/43)) ([6b11685](https://github.com/immich-app/yucca/commit/6b1168593d779ecdb7e5cfddf11e4d1c835f3e65))
* **staging:** a lot ([#147](https://github.com/immich-app/yucca/issues/147)) ([df65da6](https://github.com/immich-app/yucca/commit/df65da6f9272b0fd4fa7188e8291e471a70e110b))
* **staging:** correct vmauth url ([#153](https://github.com/immich-app/yucca/issues/153)) ([03e2802](https://github.com/immich-app/yucca/commit/03e2802c0647fa700da662f7c97c1a76f1e231f5))
* **staging:** missing quotes ([#150](https://github.com/immich-app/yucca/issues/150)) ([b03327f](https://github.com/immich-app/yucca/commit/b03327f7c767d30f823351b6bb7554c8a038bf75))
* **staging:** oidc unfun ([#151](https://github.com/immich-app/yucca/issues/151)) ([8f8be89](https://github.com/immich-app/yucca/commit/8f8be895926bb18193c22a58b69c7c40536dcabf))
* **staging:** set web port ([#152](https://github.com/immich-app/yucca/issues/152)) ([1736b7c](https://github.com/immich-app/yucca/commit/1736b7cd3adddb02a6975076f7582186b4155ae7))
* **staging:** something ([#149](https://github.com/immich-app/yucca/issues/149)) ([a92d39f](https://github.com/immich-app/yucca/commit/a92d39f4ec191375344420e7783689e0bb559ca5))
* **staging:** typo ([#146](https://github.com/immich-app/yucca/issues/146)) ([ff995bc](https://github.com/immich-app/yucca/commit/ff995bc59c7abcce4f0819973657ace9c1d7f173))
* **tf/ceph:** stop writing rendered inventories via local_file ([#155](https://github.com/immich-app/yucca/issues/155)) ([83dab28](https://github.com/immich-app/yucca/commit/83dab28c911fff05b5755097bba9bd8f0a73a42d))
* use repo metrics as source of truth for immich integration card ([#79](https://github.com/immich-app/yucca/issues/79)) ([42635f4](https://github.com/immich-app/yucca/commit/42635f4c30fb848a129e46c7a368c35d170cc154))

## [0.7.0](https://github.com/immich-app/yucca/compare/v0.6.0...v0.7.0) (2026-06-26)


### Features

* 'bytes stored' metric ([#45](https://github.com/immich-app/yucca/issues/45)) ([ce6b352](https://github.com/immich-app/yucca/commit/ce6b3529539d9c94095fd1888886b1c2f3de0e7c))
* admin API ([#106](https://github.com/immich-app/yucca/issues/106)) ([1f3ee2b](https://github.com/immich-app/yucca/commit/1f3ee2b5e62feb72b71d69a41cd07641b7f938ea))
* asymmetric jwt ([#91](https://github.com/immich-app/yucca/issues/91)) ([70fd11f](https://github.com/immich-app/yucca/commit/70fd11fb17f887801984f30959ad28c404053cdd))
* backup retention ([#89](https://github.com/immich-app/yucca/issues/89)) ([e703b08](https://github.com/immich-app/yucca/commit/e703b08b83e8e380284fcf8d178c079a253030c3))
* cancel running tasks (& node:fs repository refactor) ([#81](https://github.com/immich-app/yucca/issues/81)) ([415bb78](https://github.com/immich-app/yucca/commit/415bb7860fb3701b9dda448622307aeef1ebb565))
* **ceph:** add LV-based SSD OSD tier for sietch ([#184](https://github.com/immich-app/yucca/issues/184)) ([5af389f](https://github.com/immich-app/yucca/commit/5af389f1885abe7e8a752c71153594bb61b9c1c1))
* **ceph:** add sietch staging ansible inventory ([#166](https://github.com/immich-app/yucca/issues/166)) ([ecd28e4](https://github.com/immich-app/yucca/commit/ecd28e4beb0371ede006f254a134b3f8e792173e))
* **ceph:** add staging/ceph terraform stack ([#165](https://github.com/immich-app/yucca/issues/165)) ([8d5bb53](https://github.com/immich-app/yucca/commit/8d5bb532e37d38b4566488733f81a8c1b4d8bb6a))
* **ceph:** authorize ops SSH keys from the identity registry ([#174](https://github.com/immich-app/yucca/issues/174)) ([8618de8](https://github.com/immich-app/yucca/commit/8618de88640571cf9467f2b44d43ea6b7093dea5))
* **ceph:** import yucca-ceph ansible + terraform infrastructure ([#86](https://github.com/immich-app/yucca/issues/86)) ([63087f6](https://github.com/immich-app/yucca/commit/63087f68509b586ddead0e2c8a85d6819ad23e47))
* **ceph:** optional OSD-disk wipe in provision (clean rebuild) ([#177](https://github.com/immich-app/yucca/issues/177)) ([66740a7](https://github.com/immich-app/yucca/commit/66740a73982f9e78c7c46d284f67825e66c6cff1))
* **ceph:** per-role password length, shorter ops ([#172](https://github.com/immich-app/yucca/issues/172)) ([9c33f90](https://github.com/immich-app/yucca/commit/9c33f90e9e64ba85dd98506dc9e875611b73e53c))
* **ceph:** support per-cluster baseline packages ([#169](https://github.com/immich-app/yucca/issues/169)) ([86cbe06](https://github.com/immich-app/yucca/commit/86cbe06bc34b2387805cb3a4b49c638a8af99a10))
* **ci:** add kubeconfig / talosconfig to op ([#145](https://github.com/immich-app/yucca/issues/145)) ([fad10fd](https://github.com/immich-app/yucca/commit/fad10fdae9693ae2757cb3ab671c64700e5b3250))
* configure OpenTelemetry ([#29](https://github.com/immich-app/yucca/issues/29)) ([c568a50](https://github.com/immich-app/yucca/commit/c568a50687da78beb60e4ce65be3e080a2f35181))
* configure schedule repositories ([#78](https://github.com/immich-app/yucca/issues/78)) ([6ef94e3](https://github.com/immich-app/yucca/commit/6ef94e355cdd0febc5b8d072163ee5faa256f090))
* **customer API:** repository API ([#31](https://github.com/immich-app/yucca/issues/31)) ([6dee484](https://github.com/immich-app/yucca/commit/6dee4843d6ee2d41cfa3d219b2a1f6f97de2e7fb))
* **customer portal:** OIDC login ([#30](https://github.com/immich-app/yucca/issues/30)) ([2e288c2](https://github.com/immich-app/yucca/commit/2e288c2d0870a55d50dfd33c29913889a6c63990))
* device code flow ([#93](https://github.com/immich-app/yucca/issues/93)) ([aac9163](https://github.com/immich-app/yucca/commit/aac91631a9131d35319a87f4635bf6be078fd06a))
* **dns:** add s3.staging.austin RGW records for sietch ([#167](https://github.com/immich-app/yucca/issues/167)) ([9562a46](https://github.com/immich-app/yucca/commit/9562a46b25e765ad1a615958be80339d7a5ffac6))
* **dns:** Cloudflare-managed DNS for futo.cloud ([#121](https://github.com/immich-app/yucca/issues/121)) ([b36f63f](https://github.com/immich-app/yucca/commit/b36f63f3f89652e41c56a385970b58bb2403137d))
* Dockerfile for michael ([#76](https://github.com/immich-app/yucca/issues/76)) ([9303cc1](https://github.com/immich-app/yucca/commit/9303cc1f794a78fcb2a50a6a3b5dd82781afb952))
* fabric terraform ([#170](https://github.com/immich-app/yucca/issues/170)) ([80d15f2](https://github.com/immich-app/yucca/commit/80d15f23afadf0116f958e60db2bd74f33989d03))
* Immich integration ([#65](https://github.com/immich-app/yucca/issues/65)) ([ccdcf37](https://github.com/immich-app/yucca/commit/ccdcf37ebb9966c50d833a98e6baeadecd2de736))
* immich integration (& assorted fixes) ([#77](https://github.com/immich-app/yucca/issues/77)) ([e57db5e](https://github.com/immich-app/yucca/commit/e57db5ef1972983b47c55cbdb077f5679eb689fc))
* immich integration UX ([#87](https://github.com/immich-app/yucca/issues/87)) ([b0d8f2c](https://github.com/immich-app/yucca/commit/b0d8f2c353e832f07cace6fbad2960c1bd2672c5))
* import repositories ([#59](https://github.com/immich-app/yucca/issues/59)) ([b9aafef](https://github.com/immich-app/yucca/commit/b9aafefc21bb3f94cf6f5a7254e0324af6f8cd9d))
* initial commit ([#27](https://github.com/immich-app/yucca/issues/27)) ([0b99068](https://github.com/immich-app/yucca/commit/0b99068f236387a3974f9066fe78ec26931b28c2))
* **k8s:** point michael at the staging RGW endpoint ([#185](https://github.com/immich-app/yucca/issues/185)) ([3815637](https://github.com/immich-app/yucca/commit/3815637b500f0b7f2554c75fc98d79dbe9224a07))
* key flow modal ([#44](https://github.com/immich-app/yucca/issues/44)) ([521c193](https://github.com/immich-app/yucca/commit/521c1931ec7eb571c23b99486bfc5e09c20cfed5))
* local k8s ([#85](https://github.com/immich-app/yucca/issues/85)) ([070e22a](https://github.com/immich-app/yucca/commit/070e22a7bb16fdfe506fa334547e173982a1462b))
* metrics worker (radosgw ingest) ([#123](https://github.com/immich-app/yucca/issues/123)) ([faa2880](https://github.com/immich-app/yucca/commit/faa288087d6ca48bc935d30a90a230886fd8737f))
* **michael:** make michael also do load balancing since he's not too… ([#179](https://github.com/immich-app/yucca/issues/179)) ([065ff3d](https://github.com/immich-app/yucca/commit/065ff3d308cda981f8a0bc936115d7093a4201cd))
* more fabric things!! ([#171](https://github.com/immich-app/yucca/issues/171)) ([a6802df](https://github.com/immich-app/yucca/commit/a6802df749ef5417f32bf66a4abd50cd92232bf6))
* reconfigure primary repository backend ([#118](https://github.com/immich-app/yucca/issues/118)) ([10c0a3b](https://github.com/immich-app/yucca/commit/10c0a3b39ce3f005c38ffa95868556337cda0168))
* replace restic-api with michael ([#57](https://github.com/immich-app/yucca/issues/57)) ([4665f5c](https://github.com/immich-app/yucca/commit/4665f5cdd1dde16c141a8d400dfaaf86d2c3d5d0))
* repository backend ([#49](https://github.com/immich-app/yucca/issues/49)) ([9b0d2e6](https://github.com/immich-app/yucca/commit/9b0d2e62e34537c24262f1ed76d0afb2dbc1a7e0))
* restore backups ([#62](https://github.com/immich-app/yucca/issues/62)) ([e11a654](https://github.com/immich-app/yucca/commit/e11a6546d306200f54ab02ef096d664142f59ae9))
* schedule database backups ([#58](https://github.com/immich-app/yucca/issues/58)) ([48e468d](https://github.com/immich-app/yucca/commit/48e468d69d571a8cde10edbc882b3615d9c798dd))
* staging ([#135](https://github.com/immich-app/yucca/issues/135)) ([f700b18](https://github.com/immich-app/yucca/commit/f700b18cd6c9dd3a61fba59ff768b8fc1985da46))
* **staging:** normalize logs ([#164](https://github.com/immich-app/yucca/issues/164)) ([bc8136d](https://github.com/immich-app/yucca/commit/bc8136def5d875186af28cc2ddb00eae5f192243))
* **staging:** wire in oidc ([#148](https://github.com/immich-app/yucca/issues/148)) ([7d5af45](https://github.com/immich-app/yucca/commit/7d5af4559f8f7c658b6d153c422bf893f3aa9398))
* sync metrics to customer API ([#84](https://github.com/immich-app/yucca/issues/84)) ([aa0a346](https://github.com/immich-app/yucca/commit/aa0a3464a8448631cf1b6894ff2a9ea5c30b7b72))
* **talos:** hyper-converged Talos Kubernetes on the Sietch Ceph hosts ([#120](https://github.com/immich-app/yucca/issues/120)) ([30fdf6d](https://github.com/immich-app/yucca/commit/30fdf6da88ca952c86119da7812f440cdbb15b79))
* telemetry & start up error reporting / robustness ([#132](https://github.com/immich-app/yucca/issues/132)) ([27d1ac1](https://github.com/immich-app/yucca/commit/27d1ac10c296d1e2ad2d86f883058ce26a566086))
* use .well-known/yucca.json to discover backend ([#126](https://github.com/immich-app/yucca/issues/126)) ([65b585a](https://github.com/immich-app/yucca/commit/65b585a435a59f40599c00206a0957b23ba5cb4a))
* **yucca api:** configurable JWT expiry ([#80](https://github.com/immich-app/yucca/issues/80)) ([c64e90c](https://github.com/immich-app/yucca/commit/c64e90c7f158325a0eee82c86ac203990d2787be))
* yucca SDK ([#36](https://github.com/immich-app/yucca/issues/36)) ([957c3f8](https://github.com/immich-app/yucca/commit/957c3f8a6c28404e2c5920de6ab76cc59d03afca))
* **yucca sdk:** add authentication handoff ([#39](https://github.com/immich-app/yucca/issues/39)) ([e5981e7](https://github.com/immich-app/yucca/commit/e5981e71fc8bfa1388c2216e035fd49b41d936f4))
* **yucca sdk:** sqlite database for configuration ([#42](https://github.com/immich-app/yucca/issues/42)) ([e383fba](https://github.com/immich-app/yucca/commit/e383fbaea02312cd1426908d972618fa564efe52))


### Bug Fixes

* add package metadata for provenance ([#130](https://github.com/immich-app/yucca/issues/130)) ([64b5fa7](https://github.com/immich-app/yucca/commit/64b5fa78970d38abc683bf63d8e79ed1087b7c81))
* **ceph:** converge RGW S3 user to exactly the 1P key on rotation ([#159](https://github.com/immich-app/yucca/issues/159)) ([1cf742b](https://github.com/immich-app/yucca/commit/1cf742b0f4efa3cf7c9dc497c782cf2762ba0476))
* **ceph:** enforce dashboard admin password on every converge ([#154](https://github.com/immich-app/yucca/issues/154)) ([94e7b99](https://github.com/immich-app/yucca/commit/94e7b993fdff05d2cea3821fcd0948d426118ba5))
* **ceph:** enforce Grafana admin login password from the vault ([#157](https://github.com/immich-app/yucca/issues/157)) ([27ffe9d](https://github.com/immich-app/yucca/commit/27ffe9d1e7dab37b43a6eb7315c700abb45d2ad9))
* **ceph:** harden deploy-ceph for from-scratch reimage ([#183](https://github.com/immich-app/yucca/issues/183)) ([f82728c](https://github.com/immich-app/yucca/commit/f82728cc98f9715315b67668d8a615bda301c5e4))
* **ceph:** open cephadm service discovery port 8765 in firewall ([#156](https://github.com/immich-app/yucca/issues/156)) ([7eaa9e2](https://github.com/immich-app/yucca/commit/7eaa9e2993c7e543e2ef4e7d5d0ef7d03fd915d2))
* **ceph:** parameterize secrets vault for non-dev clusters ([#163](https://github.com/immich-app/yucca/issues/163)) ([0794082](https://github.com/immich-app/yucca/commit/07940827710ea641c7df8b178d9a2e23f23d5143))
* **ceph:** use --force-password for dashboard password on Tentacle ([#178](https://github.com/immich-app/yucca/issues/178)) ([3d52829](https://github.com/immich-app/yucca/commit/3d52829f19066194b5023f8e12ec54e982b2062f))
* chunked uploads fail checksum checks ([#38](https://github.com/immich-app/yucca/issues/38)) ([c7f78f3](https://github.com/immich-app/yucca/commit/c7f78f3735412688f6f05869ecffa7623afc97f9))
* **ci:** adjust secret name ([#142](https://github.com/immich-app/yucca/issues/142)) ([a6eeb8b](https://github.com/immich-app/yucca/commit/a6eeb8bb67452e35b00d471da0ce0a645d08cbff))
* **ci:** fix secret not having write access ([#144](https://github.com/immich-app/yucca/issues/144)) ([02dab5b](https://github.com/immich-app/yucca/commit/02dab5bcc369b58bd7bb9dc6135fa2823ec16336))
* **ci:** op wrong secret field ([#143](https://github.com/immich-app/yucca/issues/143)) ([a4e1512](https://github.com/immich-app/yucca/commit/a4e15123be60ad868429647cbfe0b2d150fee25b))
* demo padding ([#103](https://github.com/immich-app/yucca/issues/103)) ([86fff0f](https://github.com/immich-app/yucca/commit/86fff0f42539717d57353d49c33009d851452e85))
* **fabic:** a lot of custom stuff there ([#180](https://github.com/immich-app/yucca/issues/180)) ([9b39abf](https://github.com/immich-app/yucca/commit/9b39abfd6a5e8924ee849bb52087c561707df9f4))
* fabric stuff ([#173](https://github.com/immich-app/yucca/issues/173)) ([6d4056d](https://github.com/immich-app/yucca/commit/6d4056dffdb2822d9e13281603470df6bcb8cd79))
* include `python3` in Nix flake, needed for Tilt ([#122](https://github.com/immich-app/yucca/issues/122)) ([fcecc8d](https://github.com/immich-app/yucca/commit/fcecc8dc2051d557fbc3955d2488ac782c1e02b5))
* mark incomplete runs as failed on bootstrap ([#108](https://github.com/immich-app/yucca/issues/108)) ([3244657](https://github.com/immich-app/yucca/commit/32446577f8e80090a222e7ff956bc3dde8da53aa))
* missing GatewayEvent export ([#162](https://github.com/immich-app/yucca/issues/162)) ([1d94beb](https://github.com/immich-app/yucca/commit/1d94bebcdcff24a11d7605b07a90f9102dd3451b))
* package imports for orchestrator api ([#160](https://github.com/immich-app/yucca/issues/160)) ([4956b51](https://github.com/immich-app/yucca/commit/4956b5105bc55f79116af0edcc1136ce00b72e2b))
* redirect to / on login & un-delete migration ([#43](https://github.com/immich-app/yucca/issues/43)) ([6b11685](https://github.com/immich-app/yucca/commit/6b1168593d779ecdb7e5cfddf11e4d1c835f3e65))
* **staging:** a lot ([#147](https://github.com/immich-app/yucca/issues/147)) ([df65da6](https://github.com/immich-app/yucca/commit/df65da6f9272b0fd4fa7188e8291e471a70e110b))
* **staging:** correct vmauth url ([#153](https://github.com/immich-app/yucca/issues/153)) ([03e2802](https://github.com/immich-app/yucca/commit/03e2802c0647fa700da662f7c97c1a76f1e231f5))
* **staging:** missing quotes ([#150](https://github.com/immich-app/yucca/issues/150)) ([b03327f](https://github.com/immich-app/yucca/commit/b03327f7c767d30f823351b6bb7554c8a038bf75))
* **staging:** oidc unfun ([#151](https://github.com/immich-app/yucca/issues/151)) ([8f8be89](https://github.com/immich-app/yucca/commit/8f8be895926bb18193c22a58b69c7c40536dcabf))
* **staging:** set web port ([#152](https://github.com/immich-app/yucca/issues/152)) ([1736b7c](https://github.com/immich-app/yucca/commit/1736b7cd3adddb02a6975076f7582186b4155ae7))
* **staging:** something ([#149](https://github.com/immich-app/yucca/issues/149)) ([a92d39f](https://github.com/immich-app/yucca/commit/a92d39f4ec191375344420e7783689e0bb559ca5))
* **staging:** typo ([#146](https://github.com/immich-app/yucca/issues/146)) ([ff995bc](https://github.com/immich-app/yucca/commit/ff995bc59c7abcce4f0819973657ace9c1d7f173))
* **tf/ceph:** stop writing rendered inventories via local_file ([#155](https://github.com/immich-app/yucca/issues/155)) ([83dab28](https://github.com/immich-app/yucca/commit/83dab28c911fff05b5755097bba9bd8f0a73a42d))
* use repo metrics as source of truth for immich integration card ([#79](https://github.com/immich-app/yucca/issues/79)) ([42635f4](https://github.com/immich-app/yucca/commit/42635f4c30fb848a129e46c7a368c35d170cc154))

## [0.6.0](https://github.com/immich-app/yucca/compare/v0.5.0...v0.6.0) (2026-06-25)


### Features

* 'bytes stored' metric ([#45](https://github.com/immich-app/yucca/issues/45)) ([ce6b352](https://github.com/immich-app/yucca/commit/ce6b3529539d9c94095fd1888886b1c2f3de0e7c))
* admin API ([#106](https://github.com/immich-app/yucca/issues/106)) ([1f3ee2b](https://github.com/immich-app/yucca/commit/1f3ee2b5e62feb72b71d69a41cd07641b7f938ea))
* asymmetric jwt ([#91](https://github.com/immich-app/yucca/issues/91)) ([70fd11f](https://github.com/immich-app/yucca/commit/70fd11fb17f887801984f30959ad28c404053cdd))
* backup retention ([#89](https://github.com/immich-app/yucca/issues/89)) ([e703b08](https://github.com/immich-app/yucca/commit/e703b08b83e8e380284fcf8d178c079a253030c3))
* cancel running tasks (& node:fs repository refactor) ([#81](https://github.com/immich-app/yucca/issues/81)) ([415bb78](https://github.com/immich-app/yucca/commit/415bb7860fb3701b9dda448622307aeef1ebb565))
* **ceph:** import yucca-ceph ansible + terraform infrastructure ([#86](https://github.com/immich-app/yucca/issues/86)) ([63087f6](https://github.com/immich-app/yucca/commit/63087f68509b586ddead0e2c8a85d6819ad23e47))
* **ci:** add kubeconfig / talosconfig to op ([#145](https://github.com/immich-app/yucca/issues/145)) ([fad10fd](https://github.com/immich-app/yucca/commit/fad10fdae9693ae2757cb3ab671c64700e5b3250))
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
* staging ([#135](https://github.com/immich-app/yucca/issues/135)) ([f700b18](https://github.com/immich-app/yucca/commit/f700b18cd6c9dd3a61fba59ff768b8fc1985da46))
* **staging:** wire in oidc ([#148](https://github.com/immich-app/yucca/issues/148)) ([7d5af45](https://github.com/immich-app/yucca/commit/7d5af4559f8f7c658b6d153c422bf893f3aa9398))
* sync metrics to customer API ([#84](https://github.com/immich-app/yucca/issues/84)) ([aa0a346](https://github.com/immich-app/yucca/commit/aa0a3464a8448631cf1b6894ff2a9ea5c30b7b72))
* **talos:** hyper-converged Talos Kubernetes on the Sietch Ceph hosts ([#120](https://github.com/immich-app/yucca/issues/120)) ([30fdf6d](https://github.com/immich-app/yucca/commit/30fdf6da88ca952c86119da7812f440cdbb15b79))
* telemetry & start up error reporting / robustness ([#132](https://github.com/immich-app/yucca/issues/132)) ([27d1ac1](https://github.com/immich-app/yucca/commit/27d1ac10c296d1e2ad2d86f883058ce26a566086))
* use .well-known/yucca.json to discover backend ([#126](https://github.com/immich-app/yucca/issues/126)) ([65b585a](https://github.com/immich-app/yucca/commit/65b585a435a59f40599c00206a0957b23ba5cb4a))
* **yucca api:** configurable JWT expiry ([#80](https://github.com/immich-app/yucca/issues/80)) ([c64e90c](https://github.com/immich-app/yucca/commit/c64e90c7f158325a0eee82c86ac203990d2787be))
* yucca SDK ([#36](https://github.com/immich-app/yucca/issues/36)) ([957c3f8](https://github.com/immich-app/yucca/commit/957c3f8a6c28404e2c5920de6ab76cc59d03afca))
* **yucca sdk:** add authentication handoff ([#39](https://github.com/immich-app/yucca/issues/39)) ([e5981e7](https://github.com/immich-app/yucca/commit/e5981e71fc8bfa1388c2216e035fd49b41d936f4))
* **yucca sdk:** sqlite database for configuration ([#42](https://github.com/immich-app/yucca/issues/42)) ([e383fba](https://github.com/immich-app/yucca/commit/e383fbaea02312cd1426908d972618fa564efe52))


### Bug Fixes

* add package metadata for provenance ([#130](https://github.com/immich-app/yucca/issues/130)) ([64b5fa7](https://github.com/immich-app/yucca/commit/64b5fa78970d38abc683bf63d8e79ed1087b7c81))
* **ceph:** converge RGW S3 user to exactly the 1P key on rotation ([#159](https://github.com/immich-app/yucca/issues/159)) ([1cf742b](https://github.com/immich-app/yucca/commit/1cf742b0f4efa3cf7c9dc497c782cf2762ba0476))
* **ceph:** enforce dashboard admin password on every converge ([#154](https://github.com/immich-app/yucca/issues/154)) ([94e7b99](https://github.com/immich-app/yucca/commit/94e7b993fdff05d2cea3821fcd0948d426118ba5))
* **ceph:** enforce Grafana admin login password from the vault ([#157](https://github.com/immich-app/yucca/issues/157)) ([27ffe9d](https://github.com/immich-app/yucca/commit/27ffe9d1e7dab37b43a6eb7315c700abb45d2ad9))
* **ceph:** open cephadm service discovery port 8765 in firewall ([#156](https://github.com/immich-app/yucca/issues/156)) ([7eaa9e2](https://github.com/immich-app/yucca/commit/7eaa9e2993c7e543e2ef4e7d5d0ef7d03fd915d2))
* chunked uploads fail checksum checks ([#38](https://github.com/immich-app/yucca/issues/38)) ([c7f78f3](https://github.com/immich-app/yucca/commit/c7f78f3735412688f6f05869ecffa7623afc97f9))
* **ci:** adjust secret name ([#142](https://github.com/immich-app/yucca/issues/142)) ([a6eeb8b](https://github.com/immich-app/yucca/commit/a6eeb8bb67452e35b00d471da0ce0a645d08cbff))
* **ci:** fix secret not having write access ([#144](https://github.com/immich-app/yucca/issues/144)) ([02dab5b](https://github.com/immich-app/yucca/commit/02dab5bcc369b58bd7bb9dc6135fa2823ec16336))
* **ci:** op wrong secret field ([#143](https://github.com/immich-app/yucca/issues/143)) ([a4e1512](https://github.com/immich-app/yucca/commit/a4e15123be60ad868429647cbfe0b2d150fee25b))
* demo padding ([#103](https://github.com/immich-app/yucca/issues/103)) ([86fff0f](https://github.com/immich-app/yucca/commit/86fff0f42539717d57353d49c33009d851452e85))
* include `python3` in Nix flake, needed for Tilt ([#122](https://github.com/immich-app/yucca/issues/122)) ([fcecc8d](https://github.com/immich-app/yucca/commit/fcecc8dc2051d557fbc3955d2488ac782c1e02b5))
* mark incomplete runs as failed on bootstrap ([#108](https://github.com/immich-app/yucca/issues/108)) ([3244657](https://github.com/immich-app/yucca/commit/32446577f8e80090a222e7ff956bc3dde8da53aa))
* missing GatewayEvent export ([#162](https://github.com/immich-app/yucca/issues/162)) ([1d94beb](https://github.com/immich-app/yucca/commit/1d94bebcdcff24a11d7605b07a90f9102dd3451b))
* package imports for orchestrator api ([#160](https://github.com/immich-app/yucca/issues/160)) ([4956b51](https://github.com/immich-app/yucca/commit/4956b5105bc55f79116af0edcc1136ce00b72e2b))
* redirect to / on login & un-delete migration ([#43](https://github.com/immich-app/yucca/issues/43)) ([6b11685](https://github.com/immich-app/yucca/commit/6b1168593d779ecdb7e5cfddf11e4d1c835f3e65))
* **staging:** a lot ([#147](https://github.com/immich-app/yucca/issues/147)) ([df65da6](https://github.com/immich-app/yucca/commit/df65da6f9272b0fd4fa7188e8291e471a70e110b))
* **staging:** correct vmauth url ([#153](https://github.com/immich-app/yucca/issues/153)) ([03e2802](https://github.com/immich-app/yucca/commit/03e2802c0647fa700da662f7c97c1a76f1e231f5))
* **staging:** missing quotes ([#150](https://github.com/immich-app/yucca/issues/150)) ([b03327f](https://github.com/immich-app/yucca/commit/b03327f7c767d30f823351b6bb7554c8a038bf75))
* **staging:** oidc unfun ([#151](https://github.com/immich-app/yucca/issues/151)) ([8f8be89](https://github.com/immich-app/yucca/commit/8f8be895926bb18193c22a58b69c7c40536dcabf))
* **staging:** set web port ([#152](https://github.com/immich-app/yucca/issues/152)) ([1736b7c](https://github.com/immich-app/yucca/commit/1736b7cd3adddb02a6975076f7582186b4155ae7))
* **staging:** something ([#149](https://github.com/immich-app/yucca/issues/149)) ([a92d39f](https://github.com/immich-app/yucca/commit/a92d39f4ec191375344420e7783689e0bb559ca5))
* **staging:** typo ([#146](https://github.com/immich-app/yucca/issues/146)) ([ff995bc](https://github.com/immich-app/yucca/commit/ff995bc59c7abcce4f0819973657ace9c1d7f173))
* **tf/ceph:** stop writing rendered inventories via local_file ([#155](https://github.com/immich-app/yucca/issues/155)) ([83dab28](https://github.com/immich-app/yucca/commit/83dab28c911fff05b5755097bba9bd8f0a73a42d))
* use repo metrics as source of truth for immich integration card ([#79](https://github.com/immich-app/yucca/issues/79)) ([42635f4](https://github.com/immich-app/yucca/commit/42635f4c30fb848a129e46c7a368c35d170cc154))

## [0.5.0](https://github.com/immich-app/yucca/compare/v0.4.0...v0.5.0) (2026-06-25)


### Features

* **ci:** add kubeconfig / talosconfig to op ([#145](https://github.com/immich-app/yucca/issues/145)) ([fad10fd](https://github.com/immich-app/yucca/commit/fad10fdae9693ae2757cb3ab671c64700e5b3250))
* staging ([#135](https://github.com/immich-app/yucca/issues/135)) ([f700b18](https://github.com/immich-app/yucca/commit/f700b18cd6c9dd3a61fba59ff768b8fc1985da46))
* **staging:** wire in oidc ([#148](https://github.com/immich-app/yucca/issues/148)) ([7d5af45](https://github.com/immich-app/yucca/commit/7d5af4559f8f7c658b6d153c422bf893f3aa9398))


### Bug Fixes

* package imports for orchestrator api ([#160](https://github.com/immich-app/yucca/issues/160)) ([4956b51](https://github.com/immich-app/yucca/commit/4956b5105bc55f79116af0edcc1136ce00b72e2b))
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
