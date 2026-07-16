# Talos Image Factory schematic — the extension set, managed in TF. The resource
# registers schematic.yaml with the factory and returns its deterministic id; the
# metal installer/image URLs derive from it. No hand-pasted schematic id, no
# out-of-band curl. One schematic for every node (all bare-metal).
resource "talos_image_factory_schematic" "this" {
  schematic = file("${path.module}/schematic.yaml")
}

locals {
  talos_schematic_id    = talos_image_factory_schematic.this.id
  talos_metal_image_url = "https://factory.talos.dev/image/${local.talos_schematic_id}/v${var.cluster.talos_version}/metal-amd64.raw.xz"
}
