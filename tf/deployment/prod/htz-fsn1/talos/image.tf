# Installer/image URLs derive from the returned id. One schematic for every node.
resource "talos_image_factory_schematic" "this" {
  schematic = file("${path.module}/schematic.yaml")
}

locals {
  talos_schematic_id    = talos_image_factory_schematic.this.id
  talos_metal_image_url = "https://factory.talos.dev/image/${local.talos_schematic_id}/v${var.cluster.talos_version}/metal-amd64.raw.xz"
}
