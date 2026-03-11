<script lang="ts">
  /* SLOP FILE */

  import {
    Alert,
    Badge,
    Button,
    Card,
    CardBody,
    FormatBytes,
    Heading,
    HStack,
    Icon,
    IconButton,
    ProgressBar,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableRow,
    Text,
  } from "@immich/ui";
  import {
    mdiAlertCircleOutline,
    mdiCalendarClock,
    mdiCancel,
    mdiCheckCircleOutline,
    mdiClockOutline,
    mdiClose,
    mdiEye,
    mdiLoading,
    mdiTextBoxOutline,
  } from "@mdi/js";
</script>

<Alert title="Mock values provided on this page." />

<HStack>
  <Card class="flex-1">
    <CardBody class="flex flex-col gap-1">
      <Text class="text-sm opacity-70">Backups Stored</Text>
      <Heading size="giant">
        <FormatBytes bytes={1337000000} />
      </Heading>
    </CardBody>
  </Card>
  <Card color="danger" class="flex-1">
    <CardBody class="flex flex-col gap-1">
      <div class="flex justify-between items-center">
        <Text class="text-sm opacity-70">Failing Backups</Text>
        <IconButton
          aria-label="View failing backups"
          icon={mdiEye}
          color="danger"
          size="tiny"
        />
      </div>
      <Heading size="giant">2</Heading>
    </CardBody>
  </Card>
  <Card class="flex-1">
    <CardBody class="flex flex-col gap-1">
      <Text class="text-sm opacity-70">Current Usage</Text>
      <Heading size="giant">$2.67</Heading>
    </CardBody>
  </Card>
  <Card class="flex-1">
    <CardBody class="flex flex-col gap-1">
      <Text class="text-sm opacity-70">Estimated Usage</Text>
      <Heading size="giant"
        >$13.32 <span class="text-sm font-normal opacity-60">/mo</span></Heading
      >
    </CardBody>
  </Card>
</HStack>

<Stack>
  <!-- <Heading>Currently Active</Heading> -->

  <Card>
    <CardBody class="flex flex-col gap-2">
      <HStack class="items-center justify-between">
        <HStack class="items-center gap-3">
          <Icon icon={mdiLoading} size="18" class="animate-spin opacity-60" />
          <Text>
            Backing up <strong>My Important Files</strong>
          </Text>
          <Badge size="tiny" color="warning">42%</Badge>
        </HStack>
        <HStack class="gap-2">
          <Button size="tiny" variant="ghost">
            <Icon icon={mdiTextBoxOutline} size="14" />
            Log
          </Button>
          <Button size="tiny" color="danger" variant="outline">
            <Icon icon={mdiCancel} size="14" />
            Cancel
          </Button>
        </HStack>
      </HStack>
      <ProgressBar progress={0.42} size="small" />
    </CardBody>
  </Card>

  <Card>
    <CardBody class="flex flex-col gap-3">
      <HStack class="items-center justify-between">
        <HStack class="items-center gap-3">
          <Icon icon={mdiLoading} size="18" class="animate-spin opacity-60" />
          <Text>
            Running <strong>daily backups</strong> schedule
          </Text>
        </HStack>
        <Button size="tiny" color="danger" variant="outline">
          <Icon icon={mdiClose} size="14" />
          Cancel All
        </Button>
      </HStack>

      <Stack class="pl-7 gap-2">
        <HStack class="items-center justify-between">
          <HStack class="items-center gap-2">
            <Icon
              icon={mdiCheckCircleOutline}
              size="16"
              class="text-green-500"
            />
            <Text class="text-sm">Backups DEF</Text>
            <Badge size="tiny" color="success">Success</Badge>
          </HStack>
          <Button size="tiny" variant="ghost">
            <Icon icon={mdiTextBoxOutline} size="14" />
            Log
          </Button>
        </HStack>
        <HStack class="items-center justify-between">
          <HStack class="items-center gap-2">
            <Icon icon={mdiAlertCircleOutline} size="16" class="text-red-500" />
            <Text class="text-sm">Backups ABC</Text>
            <Badge size="tiny" color="danger">Failed at 63%</Badge>
          </HStack>
          <Button size="tiny" variant="ghost">
            <Icon icon={mdiTextBoxOutline} size="14" />
            Log
          </Button>
        </HStack>
        <div class="flex flex-col gap-1">
          <HStack class="items-center justify-between">
            <HStack class="items-center gap-2">
              <Icon
                icon={mdiLoading}
                size="16"
                class="animate-spin opacity-60"
              />
              <Text class="text-sm">Immich</Text>
              <Badge size="tiny" color="warning">81%</Badge>
            </HStack>
            <HStack class="gap-2">
              <Button size="tiny" variant="ghost">
                <Icon icon={mdiTextBoxOutline} size="14" />
                Log
              </Button>
              <Button size="tiny" color="danger" variant="ghost">Cancel</Button>
            </HStack>
          </HStack>
          <div class="pl-6">
            <ProgressBar progress={0.81} size="small" />
          </div>
        </div>
        <HStack class="items-center gap-2">
          <Icon icon={mdiClockOutline} size="16" class="opacity-40" />
          <Text class="text-sm opacity-60">Very Important Files</Text>
          <Badge size="tiny">Queued</Badge>
        </HStack>
      </Stack>
    </CardBody>
  </Card>

  <Card>
    <CardBody class="flex flex-col gap-3">
      <HStack class="items-center justify-between">
        <HStack class="items-center gap-3">
          <Icon icon={mdiClockOutline} size="18" class="opacity-40" />
          <Text class="opacity-60">
            Waiting to run <strong>weekly backups</strong> schedule
          </Text>
        </HStack>
        <Button size="tiny" color="danger" variant="ghost">Cancel</Button>
      </HStack>
      <Stack class="pl-7 gap-2">
        <HStack class="items-center gap-2">
          <Icon icon={mdiClockOutline} size="16" class="opacity-40" />
          <Text class="text-sm opacity-60">Very Very Important Files</Text>
          <Badge size="tiny">Queued</Badge>
        </HStack>
      </Stack>
    </CardBody>
  </Card>

  <Card>
    <CardBody class="flex flex-col gap-3">
      <HStack class="items-center justify-between">
        <HStack class="items-center gap-3">
          <Icon icon={mdiCalendarClock} size="18" class="opacity-40" />
          <Text class="opacity-60">
            <strong>weekly backups</strong> schedule
            <Badge size="tiny">in 32 minutes</Badge>
          </Text>
        </HStack>
        <Button size="tiny" variant="ghost">Edit Schedule</Button>
      </HStack>
      <Stack class="pl-7 gap-2">
        <HStack class="items-center gap-2">
          <Icon icon={mdiClockOutline} size="16" class="opacity-40" />
          <Text class="text-sm opacity-60">Very Very Important Files</Text>
        </HStack>
      </Stack>
    </CardBody>
  </Card>
</Stack>

<Stack>
  <!-- <Heading>Recent Backups</Heading> -->

  <Table striped>
    <TableBody>
      <TableRow>
        <TableCell class="text-left">My Important Files</TableCell>
        <TableCell>
          <div class="flex items-center justify-end gap-2">
            <Badge size="tiny" color="success">Success</Badge>
            <span class="text-sm opacity-60">5 hours ago</span>
            <Button size="tiny" variant="ghost">
              <Icon icon={mdiTextBoxOutline} size="14" />
              Log
            </Button>
          </div>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell class="text-left">Immich</TableCell>
        <TableCell>
          <div class="flex items-center justify-end gap-2">
            <Badge size="tiny" color="success">Success</Badge>
            <span class="text-sm opacity-60">1 day ago</span>
            <Button size="tiny" variant="ghost">
              <Icon icon={mdiTextBoxOutline} size="14" />
              Log
            </Button>
          </div>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell class="text-left">Very Important Files</TableCell>
        <TableCell>
          <div class="flex items-center justify-end gap-2">
            <Badge size="tiny" color="danger">Failed</Badge>
            <span class="text-sm opacity-60">3 days ago</span>
            <Button size="tiny" variant="ghost">
              <Icon icon={mdiTextBoxOutline} size="14" />
              Log
            </Button>
          </div>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</Stack>
