<script lang="ts">
  import Suspense from "$lib/components/util/Suspense.svelte";
  import {
    useBillingStatus,
    useManageBilling,
    useStartSubscription,
  } from "$lib/services/billing.service";
  import type { CustomerBillingStateResponseDto } from "@futo-org/backups-api-client";
  import {
    Alert,
    Button,
    Card,
    CardBody,
    CardFooter,
    CardHeader,
    CardTitle,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiCreditCardOutline } from "@mdi/js";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    initialData?: CustomerBillingStateResponseDto;
  };

  const { initialData }: Props = $props();

  // svelte-ignore state_referenced_locally
  const query = useBillingStatus(initialData);
  const subscribe = useStartSubscription();
  const manageBilling = useManageBilling();

  const onSubscribe = () =>
    subscribe.mutate(undefined, {
      onSuccess: ({ checkoutUrl }) => (location.href = checkoutUrl),
    });

  const onManageBilling = () =>
    manageBilling.mutate(undefined, {
      onSuccess: ({ customerPortalUrl }) =>
        window.open(customerPortalUrl, "_blank"),
    });
</script>

<Suspense {query}>
  {#snippet children({ subscriptionActive })}
    <Card class="max-w-xl">
      <CardHeader>
        <CardTitle>{$t`Billing`}</CardTitle>
      </CardHeader>
      <CardBody>
        {#if subscriptionActive}
          <Alert color="success" title={$t`Subscription active`}>
            {$t`Your subscription is active. Manage your payment method in the billing portal.`}
          </Alert>
        {:else}
          <Text color="secondary">
            {$t`You don't have an active subscription. Subscribe to keep your backups running.`}
          </Text>
        {/if}
      </CardBody>
      <CardFooter>
        <Stack direction="row">
          {#if !subscriptionActive}
            <Button
              leadingIcon={mdiCreditCardOutline}
              loading={subscribe.isPending}
              onclick={onSubscribe}>{$t`Subscribe`}</Button
            >
          {/if}
          <Button
            leadingIcon={mdiCreditCardOutline}
            loading={manageBilling.isPending}
            onclick={onManageBilling}>{$t`Manage billing`}</Button
          ></Stack
        >
      </CardFooter>
    </Card>
  {/snippet}
</Suspense>
