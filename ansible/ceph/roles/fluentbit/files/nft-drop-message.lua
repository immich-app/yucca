-- Managed by ansible (roles/fluentbit) - do not edit on the node.
-- ulogd2 drop events have no MESSAGE; VictoriaLogs wants one for _msg.
-- Synthesize a human-readable line from the decoded header fields (ulogd2's
-- JSON output normalizes them to src_ip/dest_ip/src_port/dest_port). The
-- structured fields all still ship alongside it.
local proto_names = { [1] = "icmp", [6] = "tcp", [17] = "udp", [58] = "icmpv6" }

function nft_drop_message(tag, ts, record)
    local proto = proto_names[record["ip.protocol"]]
        or tostring(record["ip.protocol"] or "?")
    record["MESSAGE"] = string.format("%s %s %s:%s -> %s:%s in=%s",
        record["oob.prefix"] or "drop", proto,
        record["src_ip"] or "?", tostring(record["src_port"] or "-"),
        record["dest_ip"] or "?", tostring(record["dest_port"] or "-"),
        record["oob.in"] or "?")
    return 2, ts, record
end
