# Talos Image Factory schematic — the extension set, managed in TF. The resource
# registers schematic.yaml with the factory and returns its deterministic id; we
# derive the CP (hcloud-amd64) + worker (metal-amd64) image URLs from it. No
# hand-pasted schematic id, no out-of-band curl.
resource "talos_image_factory_schematic" "this" {
  schematic = file("${path.module}/schematic.yaml")
}

# Worker (bare-metal) schematic — same set minus qemu-guest-agent (see the file).
resource "talos_image_factory_schematic" "worker" {
  schematic = file("${path.module}/schematic-worker.yaml")
}

locals {
  talos_schematic_id        = talos_image_factory_schematic.this.id
  talos_worker_schematic_id = talos_image_factory_schematic.worker.id
  talos_hcloud_image_url    = "https://factory.talos.dev/image/${local.talos_schematic_id}/v${var.cluster.talos_version}/hcloud-amd64.raw.xz"
  talos_metal_image_url     = "https://factory.talos.dev/image/${local.talos_worker_schematic_id}/v${var.cluster.talos_version}/metal-amd64.raw.xz"
}

# Talos amd64 image as an hcloud snapshot. hcloud can't boot the Talos ISO, so the
# snapshot is built ONCE, out of band, by:
#
#   mise run hetzner:talos-image
#
# (it reads talos_hcloud_image_url from this stack's output, spins a temporary
# rescue server, dd's the image, snapshots, tears down). This data source then
# resolves it by label — rebuild only on a Talos version bump.
data "hcloud_image" "talos" {
  with_selector     = "os=talos,cluster=${var.cluster.name},arch=amd64"
  with_architecture = "x86"
  most_recent       = true
}
