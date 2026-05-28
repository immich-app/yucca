<script lang="ts">
  import {
    VisualisationGauge,
    VisualisationSegmentedBar,
  } from "@futo-org/backups-orchestrator-ui";
  import {
    Button,
    Card,
    CardBody,
    CardHeader,
    CardTitle,
    HStack,
  } from "@immich/ui";

  const { data } = $props();

  // TODO: useRepositories
  const recentAttempts = $derived(
    data.initialData.repositories.repositories
      .filter((item) => item.metrics.lastBackup)
      .toSorted((a, b) =>
        a.metrics.lastBackup!.localeCompare(b.metrics.lastBackup!),
      )
      .slice(0, 5),
  );
</script>

<!-- <span>Logged in as {data.user!.name} ({data.user!.email})</span>

{JSON.stringify(data.initialData)} -->

<div class="flex flex-col gap-2">
  <div class="flex gap-2">
    <Card>
      <CardHeader>
        <HStack class="justify-between">
          <CardTitle>Your Backups</CardTitle>
          <a href="/dashboard/backups">
            <Button variant="outline" size="tiny">View all</Button></a
          >
        </HStack>
      </CardHeader>
      <CardBody>
        <VisualisationSegmentedBar
          title="Backup Health"
          summary="75 of 100 successful"
          segments={[
            {
              value: 75,
              label: "Successful",
              color: "var(--immich-ui-success-500)",
              badge: "success",
            },
            {
              value: 10,
              label: "Offline",
              color: "var(--immich-ui-warning-500)",
              badge: "warning",
            },
            {
              value: 10,
              label: "Failed",
              color: "var(--immich-ui-danger-500)",
              badge: "danger",
            },
            {
              value: 5,
              label: "Never Run",
              color: "var(--immich-ui-light-400)",
              badge: "secondary",
            },
          ]}
        />
      </CardBody>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>Install FUTO Backups</CardTitle>
      </CardHeader>
      <CardBody>
        <span class="text-gray-400">[Upsell text here]</span>
      </CardBody>
    </Card>
  </div>
  <div class="flex gap-2">
    <Card>
      <CardBody>
        <VisualisationGauge title="Avg. Backup Time" content="3s" />
      </CardBody>
    </Card>
    <Card>
      <CardBody>
        <VisualisationGauge title="Daily Backup Time" content="2s" />
      </CardBody>
    </Card>
    <Card>
      <CardBody>
        <VisualisationGauge title="Total Stored" content="14.3 KiB" />
      </CardBody>
    </Card>
    <Card>
      <CardBody>
        <VisualisationGauge title="Current Usage" content="$2.3/mo" />
      </CardBody>
    </Card>
  </div>
  <Card>
    <CardHeader>
      <CardTitle>Recent Backups</CardTitle>
    </CardHeader>
    <CardBody>
      {JSON.stringify(recentAttempts)}
    </CardBody>
  </Card>
</div>
