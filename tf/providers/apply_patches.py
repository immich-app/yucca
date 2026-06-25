#!/usr/bin/env python3
"""Re-apply local patches to the JTAF-generated junos-qfx provider.

JTAF regenerates the provider from device YANG + config (mise fabric:provider-gen),
which overwrites our edits. This script re-applies them; it's idempotent and run
automatically at the end of fabric:provider-gen.

Patch: `readStateFromDevice` trusts the apply — it returns the reference (the
Terraform plan / prior state) instead of reading the WHOLE device back and
reconciling. The provider manages only a slice of the config (pushed via a
NETCONF merge); the device always carries config outside that slice (the built-in
`default` VLAN, em0/vme, the `system` block, ...), so a full read-back trips
Terraform's "provider produced inconsistent result after apply". Trade-off:
out-of-band drift isn't detected; every apply re-asserts the merge.
"""
import sys
import pathlib

src = pathlib.Path(__file__).parent / "terraform-provider-junos-qfx" / "resource_config_provider.go"
t = src.read_text()

sig = ("func (r *configResource) readStateFromDevice(ctx context.Context, "
       "reference ConfigResourceModel, diags *diag.Diagnostics) (ConfigResourceModel, bool) {")
if sig not in t:
    print("apply_patches: readStateFromDevice signature not found — provider changed?", file=sys.stderr)
    sys.exit(1)

i = t.index(sig)
j = t.index("\n}\n", i)  # the function's closing brace at column 0
body = (sig +
        "\n\t// PATCHED (fabric): trust the apply — return the plan/prior state as the"
        "\n\t// resource state instead of reading the whole device back (avoids"
        "\n\t// \"provider produced inconsistent result\"). See apply_patches.py.\n"
        "\treturn reference, true\n")
patched = t[:i] + body + t[j + 1:]

if patched != t:
    src.write_text(patched)
    print("apply_patches: patched readStateFromDevice")
else:
    print("apply_patches: already patched")
