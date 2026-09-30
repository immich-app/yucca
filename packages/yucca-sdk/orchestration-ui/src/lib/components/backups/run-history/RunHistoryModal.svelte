<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { Modal, ModalBody } from "@immich/ui";
  import RepositoryRunHistoryPage from "./RepositoryRunHistoryPage.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    repository: LocalRepositoryDto;
    onClose: () => void;
  };

  let { repository, onClose }: Props = $props();
</script>

<Modal title={$t({
    message: "Run History for {name}",
    values: { name: repository.name },
  })} size="giant" {onClose}>
  <ModalBody>
    <RepositoryRunHistoryPage {repository} />
  </ModalBody>
</Modal>
