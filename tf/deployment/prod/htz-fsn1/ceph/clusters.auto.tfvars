# Declarative cluster inventory for prod / htz-fsn1. Adding/altering a cluster =
# edit here, then `terragrunt apply` (renders inventory + creates the SPICE_CEPH_*
# 1P items) and `ansible/ceph/scripts/render-inventories.sh prod htz-fsn1`.
#
# spice = the 48-node SX295 Ceph cluster in Falkenstein (FSN1-DC24). Host names
# are explicit (declared here) so hostnames are known without a TF apply (the
# reprovision driver needs them); server_number -> WAN-IP -> host_index mapping
# lives in the sidecar spice-hosts.yaml (consumed by the reprovision driver +
# the networkd fabric config), since the ceph `hosts` schema carries only
# name/bond_ip/bootstrap/roles.
#
# MON quorum = 5 nodes (roles include "mon"): adelia(bootstrap), curtis, hayley,
# lizzie, serena - evenly spread across the roster. The other 43 are osd+rgw.
#
# bond_ip = the 1G WAN address ansible connects to FOR NOW (default route via WAN).
# Ceph public/cluster traffic moves to the bonded 25G VLANs later
# (public 10.40.20.0/23 VLAN120, private 10.40.22.0/23 VLAN122) - see group_vars.
# provision_profile = null: Hetzner installimage path (no debian-live provision).

clusters = {
  spice = {
    domain            = "prod.fsn1.htz.futo.cloud"
    partition         = "prod"
    region            = "htz-fsn1"
    provider_code     = "htz"
    role_in_hostname  = "ceph"
    ansible_ssh_user  = "root"
    ansible_ssh_key   = "~/.ssh/id_ed25519_spice"
    vault             = "yucca_tf_prod"
    provision_profile = null
    manage_rgw_users  = true
    # 0 = no bucket limit (RGW semantics): michael mints one bucket per restic
    # repository, so prod must not cap them.
    rgw_restic_max_buckets = 0
    # SPICE_CEPH_ALERTMANAGER_WEBHOOK_URL is provisioned out of band (Zulip
    # incoming webhook) and referenced, never generated. See secrets.tf.
    alertmanager_webhook = true

    # === Ceph config (-> group_vars/all/ceph-config.generated.yml) ===
    # Desired state for `ceph config set`, merged over the ceph_tuning defaults.
    #
    # Deep scrub at 28d, not the role's 7d. Shallow stays at 7d.
    #
    # osd_deep_scrub_interval goes in `global`, not `osd`. The active mgr reads
    # its own copy for PG_NOT_DEEP_SCRUBBED, so an `osd` entry leaves the health
    # check on the 7-day default.
    #
    # Two settings gate scrub scheduling. Both must be open or scrubbing stops.
    #
    # 1. Window off (0/0 = all day), overriding the role's 02:00-06:00. Tentacle
    # has no `overdue` urgency, so the window gates a scrub however overdue it
    # is. Client load here is hour-of-day independent, so the window protects
    # nothing.
    #
    # 2. osd_scrub_during_recovery. The role default (false) does not scale with
    # EC width: a recovering OSD refuses scrub reservations, and a k16+m4 PG
    # needs all 20 shards free, so any nontrivial rebalance stops scrubbing
    # outright. Costs roughly 4x recovery throughput while scrubs run.
    #
    # osd_scrub_cost and osd_deep_scrub_stride are upstream defaults. They and
    # osd_scrub_disable_reservation_queuing (removed) came from the squid scrub
    # thread: https://www.mail-archive.com/ceph-users@ceph.io/msg28007.html
    ceph_config = {
      global = {
        osd_deep_scrub_interval = "2419200" # 28 days
      }
      osd = {
        osd_scrub_begin_hour      = "0" # 0/0 = no window
        osd_scrub_end_hour        = "0"
        osd_scrub_during_recovery = "true"
        osd_max_scrubs            = "6"
        osd_scrub_cost            = "52428800" # upstream default
        osd_deep_scrub_stride     = "524288"   # upstream default, 512 KiB
        osd_mclock_profile        = "high_recovery_ops"
      }
    }
    hosts = [
      { name = "adelia", bond_ip = "178.63.139.248", bootstrap = true, roles = ["mon", "mgr", "osd", "rgw"] }, # srv 3008187 host_index 4  MON
      { name = "alexus", bond_ip = "178.63.139.254", roles = ["osd", "rgw"] },                                 # srv 3008189 host_index 5
      { name = "alyssa", bond_ip = "178.63.139.228", roles = ["osd", "rgw"] },                                 # srv 3008190 host_index 6
      { name = "ardith", bond_ip = "178.63.139.227", roles = ["osd", "rgw"] },                                 # srv 3008191 host_index 7
      { name = "athena", bond_ip = "178.63.139.225", roles = ["osd", "rgw"] },                                 # srv 3008192 host_index 8
      { name = "bernie", bond_ip = "178.63.139.226", roles = ["osd", "rgw"] },                                 # srv 3008193 host_index 9
      { name = "braden", bond_ip = "178.63.139.240", roles = ["osd", "rgw"] },                                 # srv 3008194 host_index 10
      { name = "callie", bond_ip = "178.63.139.243", roles = ["osd", "rgw"] },                                 # srv 3008195 host_index 11
      { name = "catina", bond_ip = "178.63.139.244", roles = ["osd", "rgw"] },                                 # srv 3008196 host_index 12
      { name = "cletus", bond_ip = "178.63.139.253", roles = ["osd", "rgw"] },                                 # srv 3008197 host_index 13
      { name = "curtis", bond_ip = "178.63.139.252", roles = ["mon", "mgr", "osd", "rgw"] },                   # srv 3008198 host_index 14  MON
      { name = "darion", bond_ip = "178.63.139.251", roles = ["osd", "rgw"] },                                 # srv 3008199 host_index 15
      { name = "deidra", bond_ip = "178.63.139.250", roles = ["osd", "rgw"] },                                 # srv 3008200 host_index 16
      { name = "deonte", bond_ip = "178.63.139.249", roles = ["osd", "rgw"] },                                 # srv 3008201 host_index 17
      { name = "dorian", bond_ip = "178.63.139.242", roles = ["osd", "rgw"] },                                 # srv 3008202 host_index 18
      { name = "edythe", bond_ip = "178.63.139.247", roles = ["osd", "rgw"] },                                 # srv 3008203 host_index 19
      { name = "eloise", bond_ip = "178.63.139.246", roles = ["osd", "rgw"] },                                 # srv 3008204 host_index 20
      { name = "evelyn", bond_ip = "178.63.139.245", roles = ["osd", "rgw"] },                                 # srv 3008205 host_index 21
      { name = "gaylon", bond_ip = "178.63.139.241", roles = ["osd", "rgw"] },                                 # srv 3008206 host_index 22
      { name = "graham", bond_ip = "178.63.139.239", roles = ["osd", "rgw"] },                                 # srv 3008207 host_index 23
      { name = "hayley", bond_ip = "178.63.139.230", roles = ["mon", "mgr", "osd", "rgw"] },                   # srv 3012008 host_index 24  MON
      { name = "howell", bond_ip = "178.63.139.222", roles = ["osd", "rgw"] },                                 # srv 3012009 host_index 25
      { name = "jacque", bond_ip = "178.63.139.221", roles = ["osd", "rgw"] },                                 # srv 3012010 host_index 26
      { name = "javier", bond_ip = "178.63.139.207", roles = ["osd", "rgw"] },                                 # srv 3012011 host_index 27
      { name = "jewell", bond_ip = "178.63.139.210", roles = ["osd", "rgw"] },                                 # srv 3012012 host_index 28
      { name = "joseph", bond_ip = "178.63.139.218", roles = ["osd", "rgw"] },                                 # srv 3012013 host_index 29
      { name = "kassie", bond_ip = "178.63.139.208", roles = ["osd", "rgw"] },                                 # srv 3012014 host_index 30
      { name = "kelsea", bond_ip = "178.63.139.217", roles = ["osd", "rgw"] },                                 # srv 3012015 host_index 31
      { name = "kurtis", bond_ip = "178.63.139.234", roles = ["osd", "rgw"] },                                 # srv 3012016 host_index 32
      { name = "lemuel", bond_ip = "178.63.139.214", roles = ["osd", "rgw"] },                                 # srv 3012017 host_index 33
      { name = "lizzie", bond_ip = "178.63.139.213", roles = ["mon", "mgr", "osd", "rgw"] },                   # srv 3014572 host_index 34  MON
      { name = "lucius", bond_ip = "178.63.139.212", roles = ["osd", "rgw"] },                                 # srv 3014573 host_index 35
      { name = "marian", bond_ip = "178.63.139.211", roles = ["osd", "rgw"] },                                 # srv 3014574 host_index 36
      { name = "mattie", bond_ip = "178.63.139.237", roles = ["osd", "rgw"] },                                 # srv 3014575 host_index 37
      { name = "miguel", bond_ip = "178.63.139.216", roles = ["osd", "rgw"] },                                 # srv 3014576 host_index 38
      { name = "murphy", bond_ip = "178.63.139.232", roles = ["osd", "rgw"] },                                 # srv 3014577 host_index 39
      { name = "noreen", bond_ip = "178.63.139.220", roles = ["osd", "rgw"] },                                 # srv 3014578 host_index 40
      { name = "philip", bond_ip = "178.63.139.219", roles = ["osd", "rgw"] },                                 # srv 3014579 host_index 41
      { name = "raymon", bond_ip = "178.63.139.223", roles = ["osd", "rgw"] },                                 # srv 3014580 host_index 42
      { name = "romona", bond_ip = "178.63.139.236", roles = ["osd", "rgw"] },                                 # srv 3014581 host_index 43
      { name = "serena", bond_ip = "178.63.139.229", roles = ["mon", "mgr", "osd", "rgw"] },                   # srv 3014582 host_index 44  MON
      { name = "shanna", bond_ip = "178.63.139.209", roles = ["osd", "rgw"] },                                 # srv 3014583 host_index 45
      { name = "shelby", bond_ip = "178.63.139.224", roles = ["osd", "rgw"] },                                 # srv 3014584 host_index 46
      { name = "sommer", bond_ip = "178.63.139.215", roles = ["osd", "rgw"] },                                 # srv 3014585 host_index 47
      { name = "sylvia", bond_ip = "178.63.139.235", roles = ["osd", "rgw"] },                                 # srv 3014586 host_index 48
      { name = "theron", bond_ip = "178.63.139.238", roles = ["osd", "rgw"] },                                 # srv 3014587 host_index 49
      { name = "trista", bond_ip = "178.63.139.233", roles = ["osd", "rgw"] },                                 # srv 3014588 host_index 50
      { name = "virgie", bond_ip = "178.63.139.231", roles = ["osd", "rgw"] },                                 # srv 3014589 host_index 51
    ]
  }
}
