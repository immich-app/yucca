#!/usr/bin/env python3
"""Re-apply local patches to the JTAF-generated junos-qfx provider.

JTAF regenerates the provider from device YANG + config (mise fabric:provider-gen),
overwriting our edits. This re-applies them; it's idempotent and run automatically
at the end of fabric:provider-gen.

Patches:
  1. readStateFromDevice — trust the apply: return the reference (plan/prior state)
     instead of reading the WHOLE device back and reconciling. The provider manages
     only a slice; the device always carries config outside it (the built-in
     `default` VLAN, em0/vme, the `system` block, ...), so a full read-back trips
     Terraform's "provider produced inconsistent result". Trade-off: out-of-band
     drift isn't detected; every apply re-asserts the merge.
  2. publicKeyFile / NewClient — fail with a clear error on an unreadable/unparseable
     SSH key instead of returning a nil AuthMethod, which made the SSH handshake
     panic ("Plugin did not respond").
"""
import sys
import pathlib

root = pathlib.Path(__file__).parent / "terraform-provider-junos-qfx"
errors = []


def patch_readstate():
    src = root / "resource_config_provider.go"
    t = src.read_text()
    sig = ("func (r *configResource) readStateFromDevice(ctx context.Context, "
           "reference ConfigResourceModel, diags *diag.Diagnostics) (ConfigResourceModel, bool) {")
    if sig not in t:
        errors.append("readStateFromDevice signature not found")
        return
    i = t.index(sig)
    j = t.index("\n}\n", i)
    body = (sig +
            "\n\t// PATCHED (fabric): trust the apply — return the plan/prior state as the"
            "\n\t// resource state instead of reading the whole device back (avoids"
            "\n\t// \"provider produced inconsistent result\"). See apply_patches.py.\n"
            "\treturn reference, true\n")
    new = t[:i] + body + t[j + 1:]
    if new != t:
        src.write_text(new)
        print("  patched readStateFromDevice")
    else:
        print("  readStateFromDevice already patched")


def replace_once(src, old, new, label):
    t = src.read_text()
    if new in t:
        print(f"  {label} already patched")
        return
    if old not in t:
        errors.append(f"{label}: target not found")
        return
    src.write_text(t.replace(old, new, 1))
    print(f"  patched {label}")


def patch_client():
    src = root / "netconf" / "client.go"
    replace_once(
        src,
        "func publicKeyFile(file string) ssh.AuthMethod {\n"
        "\tbuffer, err := os.ReadFile(file)\n"
        "\tif err != nil {\n\t\treturn nil\n\t}\n\n"
        "\tkey, err := ssh.ParsePrivateKey(buffer)\n"
        "\tif err != nil {\n\t\treturn nil\n\t}\n"
        "\treturn ssh.PublicKeys(key)\n}",
        "func publicKeyFile(file string) (ssh.AuthMethod, error) {\n"
        "\tbuffer, err := os.ReadFile(file)\n"
        "\tif err != nil {\n\t\treturn nil, fmt.Errorf(\"reading SSH key %q: %w\", file, err)\n\t}\n\n"
        "\tkey, err := ssh.ParsePrivateKey(buffer)\n"
        "\tif err != nil {\n\t\treturn nil, fmt.Errorf(\"parsing SSH key %q (is it a valid private key?): %w\", file, err)\n\t}\n"
        "\treturn ssh.PublicKeys(key), nil\n}",
        "publicKeyFile",
    )
    replace_once(
        src,
        "\tif sshKey != \"\" {\n"
        "\t\tauthMethod := publicKeyFile(sshKey)\n"
        "\t\tcfg.Auth = []ssh.AuthMethod{authMethod}\n"
        "\t} else {",
        "\tif sshKey != \"\" {\n"
        "\t\tauthMethod, err := publicKeyFile(sshKey)\n"
        "\t\tif err != nil {\n\t\t\treturn nil, err\n\t\t}\n"
        "\t\tcfg.Auth = []ssh.AuthMethod{authMethod}\n"
        "\t} else {",
        "NewClient",
    )


patch_readstate()
patch_client()

if errors:
    print("apply_patches: FAILED:\n  - " + "\n  - ".join(errors), file=sys.stderr)
    sys.exit(1)
print("apply_patches: done")
