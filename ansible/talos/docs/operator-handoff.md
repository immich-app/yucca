# Manual talosctl recovery

The Terraform `talos-bootstrap` module owns normal cluster bring-up —
machine config, `apply-config`, the one-shot `bootstrap`, and kubeconfig
output (see [runbooks/cluster-bring-up.md](runbooks/cluster-bring-up.md)).
You should not need raw `talosctl` for a healthy deploy.

This note keeps the manual sequence for the times you do: debugging a
single node, recovering when TF can't reach the API, or talking to a VM
before it has joined the cluster. It assumes `talosctl` on your machine
and a route to VLAN 50 (10.50.0.0/16).

## Talking to a node directly

Nodes have fixed addresses (`10.50.5.0/24`, from `clusters.auto.tfvars`),
so there's no discovery step. Point talosctl at a specific node:

```bash
export TALOSCONFIG=~/.talos/sietch-talos.config
talosctl --nodes 10.50.5.11 --endpoints 10.50.5.11 version
talosctl --nodes 10.50.5.11 service etcd          # inspect a service
talosctl --nodes 10.50.5.11 dmesg                 # kernel log
talosctl --nodes 10.50.5.11 reset --graceful --reboot   # wipe one node
```

Before a node has PKI (fresh VM, pre-`apply-config`), use `--insecure` —
the node has nothing to authenticate you with yet. Once config is applied,
talosconfig provides mutual auth.

## Gotchas worth knowing

- **VIP needs DHCP exclusion.** The CP VIP `10.50.0.10` is claimed on top
  of a CP's address. If the upstream DHCP server ever hands `10.50.0.10`
  to another host on VLAN 50, ARP conflicts and the apiserver endpoint
  silently breaks. The DHCP pool (`10.50.0.16`–`10.50.4.255`) starts above
  the VIP; the upstream server config must agree.
- **talosconfig endpoints use direct CP IPs, not the VIP.** For kubectl
  the VIP is correct (apiserver binds it). For talosctl it's wrong: the
  VIP follows the leader, and the leader is exactly what you can't reach
  during a failure. The TF bootstrap already splits these; if you hand-gen
  a config, repoint its endpoint to the direct CP IPs after bootstrap.
- **VIP patches target `interface: enp1s0`** — the same NIC the kernel
  `ip=` cmdline configures (q35 VMs use predictable names). If you
  hand-write a patch with `interface: eth0`, it silently no-ops and the
  VIP never comes up; match the cmdline's interface name exactly.

## Troubleshooting

**VM not reachable on VLAN 50 after `provision-vms`**
1. VM running? `ssh <hypervisor> sudo virsh list`
2. vnet attached to the bridge? `sudo ip -d link show master br-vlan50`
3. VLAN 50 tagged on the upstream switch port? (switch admin — out of reach)

**`talosctl` times out against a node**
- Talos refuses connections until its API is up (usually within 30s of VM
  start). Wait and retry.
- Still failing: check the console — `sudo virsh console sietch-talos-cp1`
  on the hypervisor (Ctrl-] to exit).

**`talosctl bootstrap` reports etcd already initialized**
- Bootstrap already ran. Either you're re-deploying and need `talosctl
  reset` first, or this node was already bootstrapped. Bootstrap is
  one-shot — re-running rolls cluster identity.

## Tear-down

Full-cluster tear-down lives in
[runbooks/cluster-bring-up.md](runbooks/cluster-bring-up.md) — the order
matters (reset workers→CPs, then `destroy-vms`, then `tf:destroy --
-refresh=false`) and is documented once, there. For a single node, use
`talosctl reset` from "Talking to a node directly" above.
