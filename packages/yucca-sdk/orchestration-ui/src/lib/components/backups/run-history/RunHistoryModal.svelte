<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { Modal, ModalBody } from "@immich/ui";
  import RepositoryRunHistory from "./RepositoryRunHistory.svelte";

  type Props = {
    repository: LocalRepositoryDto;
    onClose: () => void;
  };

  let { repository, onClose }: Props = $props();
</script>

<Modal title={`Run History for ${repository.name}`} size="giant" {onClose}>
  <ModalBody>
    <RepositoryRunHistory {repository} />
  </ModalBody>
</Modal>
