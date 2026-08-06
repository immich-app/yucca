<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { Modal, ModalBody } from "@immich/ui";
  import RepositoryRunHistoryPage from "./RepositoryRunHistoryPage.svelte";

  type Props = {
    repository: LocalRepositoryDto;
    onClose: () => void;
  };

  let { repository, onClose }: Props = $props();
</script>

<Modal title={`Run History for ${repository.name}`} size="giant" {onClose}>
  <ModalBody>
    <RepositoryRunHistoryPage {repository} />
  </ModalBody>
</Modal>
