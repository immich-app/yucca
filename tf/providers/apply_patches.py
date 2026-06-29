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
  3. execute / netconfReplyError — surface NETCONF <rpc-error> (at any depth, incl.
     nested under <commit-results>) as a real error. The generated client ignored
     reply errors, so a rejected load/commit silently no-op'd while reporting success.
  4. patch/CreateDiffPatch — emit nc:operation="merge" instead of "create" for
     ADDED nodes, so applies are idempotent over pre-existing device config
     (brownfield / empty-state diffs, e.g. after a state-key change re-pushes the
     whole config). replace/delete unchanged. Consistent with the edit-config
     default-operation=merge envelope and patch #1 (trust-the-apply).
  5. Update — diff the plan against the PRIOR TF STATE, not the live device. The
     generated Update read the WHOLE device (MarshalConfig) as the diff baseline, so
     every Update emitted a DELETE for all in-schema config outside this resource's
     slice — fatal when multiple slice-resources (core/login/cluster) share a device.
     Create (pushes its slice) and Delete (diffs its state-slice) are already
     state-based; this makes Update match. Mirrors patch #1.
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


NETCONF_REPLY_ERROR_FN = '''

// netconfReplyError returns a non-nil error if the rpc-reply contains any
// error-severity <rpc-error> at ANY depth. Junos nests them under
// <commit-results> (optionally per <routing-engine>) and
// <load-configuration-results>, not just directly under <rpc-reply>.
func netconfReplyError(raw []byte) error {
	dec := xml.NewDecoder(bytes.NewReader(raw))
	var msgs []string
	for {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		se, ok := tok.(xml.StartElement)
		if !ok || se.Name.Local != "rpc-error" {
			continue
		}
		var e struct {
			Severity string `xml:"error-severity"`
			Message  string `xml:"error-message"`
			Path     string `xml:"error-path"`
		}
		if dec.DecodeElement(&e, &se) != nil {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(e.Severity), "warning") {
			continue
		}
		m := strings.TrimSpace(e.Message)
		if p := strings.TrimSpace(e.Path); p != "" {
			m = strings.TrimSpace(p) + ": " + m
		}
		if m != "" {
			msgs = append(msgs, m)
		}
	}
	if len(msgs) > 0 {
		return fmt.Errorf("device rejected the change: %s", strings.Join(msgs, "; "))
	}
	return nil
}
'''


def patch_client():
    src = root / "netconf" / "client.go"

    # 1. SSH key: clear error instead of nil AuthMethod -> panic.
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

    # 2. Surface NETCONF rpc-error: bytes import, execute() check, helper fn.
    replace_once(
        src,
        "import (\n\t\"context\"",
        "import (\n\t\"bytes\"\n\t\"context\"",
        "bytes import",
    )
    replace_once(
        src,
        "\tdebugRPC(\"rpc reply\", string(rawReply))\n\n\treply := struct {",
        "\tdebugRPC(\"rpc reply\", string(rawReply))\n\n"
        "\tif rerr := netconfReplyError(rawReply); rerr != nil {\n\t\treturn \"\", rerr\n\t}\n\n"
        "\treply := struct {",
        "execute rpc-error check",
    )
    t = src.read_text()
    if "func netconfReplyError(" not in t:
        src.write_text(t.rstrip() + "\n" + NETCONF_REPLY_ERROR_FN)
        print("  appended netconfReplyError")
    else:
        print("  netconfReplyError already present")


def patch_diff_merge():
    src = root / "patch" / "patch.go"
    # Positional leaf-list adds (ordered Create + Replace-reorder's new value).
    replace_once(
        src,
        '\t\t\t\tleaf := &Node{Tag: p.tag, Parent: p.parent, Operation: "create", Text: p.change.NewVal}',
        '\t\t\t\tleaf := &Node{Tag: p.tag, Parent: p.parent, Operation: "merge", Text: p.change.NewVal}',
        "diff positional create (leaf)",
    )
    replace_once(
        src,
        '\t\t\t\tcre := &Node{Tag: p.tag, Parent: p.parent, Operation: "create", Text: p.change.NewVal}',
        '\t\t\t\tcre := &Node{Tag: p.tag, Parent: p.parent, Operation: "merge", Text: p.change.NewVal}',
        "diff positional create (cre)",
    )
    # Regular leaf add.
    replace_once(
        src,
        '\t\tcase Create:\n\t\t\tleaf.Operation = "create"\n\t\t\tleaf.Text = p.change.NewVal',
        '\t\tcase Create:\n'
        '\t\t\t// merge, not create: idempotent over pre-existing device config\n'
        '\t\t\t// (brownfield/empty-state applies), consistent with default-operation=merge.\n'
        '\t\t\tleaf.Operation = "merge"\n\t\t\tleaf.Text = p.change.NewVal',
        "diff leaf create->merge",
    )
    # Keyed-list entry parent add.
    replace_once(
        src,
        '\tswitch change.Op {\n\tcase Create:\n\t\tparent.Operation = "create"',
        '\tswitch change.Op {\n\tcase Create:\n'
        '\t\t// merge (see Create case above): idempotent over existing config.\n'
        '\t\tparent.Operation = "merge"',
        "diff keyed-entry create->merge",
    )


def patch_update_diff():
    src = root / "resource_config_provider.go"
    replace_once(
        src,
        "\tvar stateConfig xml_Configuration\n"
        "\terr := r.client.MarshalConfig(&stateConfig)\n"
        "\tif err != nil {\n"
        "\t\tresp.Diagnostics.AddError(\"Failed while reading current configuration\", err.Error())\n"
        "\t\treturn\n"
        "\t}\n\n"
        "\tplanXML, err := marshalConfigXML(planConfig)",
        "\t// PATCHED (fabric): diff against PRIOR TF STATE, not the live device. This\n"
        "\t// resource manages only a slice; diffing the plan against the whole device made\n"
        "\t// every Update emit a DELETE for all in-schema config outside this slice\n"
        "\t// (another resource's `system login`, firewall, lo0/ae0/irb, ...). Mirrors\n"
        "\t// patch #1 (Read trusts the state) and Delete (already state-based).\n"
        "\tvar priorState ConfigResourceModel\n"
        "\tresp.Diagnostics.Append(req.State.Get(ctx, &priorState)...)\n"
        "\tif resp.Diagnostics.HasError() {\n"
        "\t\treturn\n"
        "\t}\n"
        "\tstateConfig := modelToConfig(ctx, priorState, &resp.Diagnostics)\n"
        "\tif resp.Diagnostics.HasError() {\n"
        "\t\treturn\n"
        "\t}\n\n"
        "\tplanXML, err := marshalConfigXML(planConfig)",
        "Update diff vs prior state",
    )


patch_readstate()
patch_client()
patch_diff_merge()
patch_update_diff()

if errors:
    print("apply_patches: FAILED:\n  - " + "\n  - ".join(errors), file=sys.stderr)
    sys.exit(1)
print("apply_patches: done")
