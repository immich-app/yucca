<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { Modal, ModalBody } from "@immich/ui";
  import RepositorySnapshotsPage from "./RepositorySnapshotsPage.svelte";

  type Props = {
    repository: LocalRepositoryDto;
    onClose: () => void;
  };

  let { repository, onClose }: Props = $props();
</script>

<Modal title={`Snapshots for ${repository.name}`} size="giant" {onClose}>
  <ModalBody>
    <RepositorySnapshotsPage {repository} />
  </ModalBody>
</Modal>
