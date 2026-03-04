<script lang="ts">
  import {
    Alert,
    Badge,
    Card,
    CardBody,
    FormatBytes,
    Heading,
    HStack,
    IconButton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableRow,
    Text,
    VStack,
  } from "@immich/ui";
  import { mdiEye, mdiFileAlert } from "@mdi/js";
</script>

<Alert title="Mock values provided on this page." />

<HStack>
  <Card>
    <CardBody class="flex flex-col gap-2">
      <Text>Backups Stored</Text>
      <Heading size="giant">
        <FormatBytes bytes={1337000000} />
      </Heading>
    </CardBody>
  </Card>
  <Card color="danger">
    <CardBody class="flex flex-col gap-2">
      <div class="flex justify-between items-center">
        <Text>Failing Backups</Text>
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
  <Card>
    <CardBody class="flex flex-col gap-2">
      <Text>Current Usage</Text>
      <Heading size="giant"
        >$ 2.67 <span class="text-sm">since 1st March</span></Heading
      >
    </CardBody>
  </Card>
  <Card>
    <CardBody class="flex flex-col gap-2">
      <Text>Estimated Usage</Text>
      <Heading size="giant">$ 13.32 <span class="text-sm">/mo</span></Heading>
    </CardBody>
  </Card>
</HStack>

<Stack>
  <Heading>Recent Backups</Heading>

  <Table>
    <TableBody>
      <TableRow>
        <TableCell class="text-left">My Important Files</TableCell>
        <TableCell class="text-right">
          <Badge size="small" color="success">Successful 5 hours ago</Badge>
          <Badge size="small">View Log</Badge>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell class="text-left">Immich</TableCell>
        <TableCell class="text-right">
          <Badge size="small" color="success">Successful 1 day ago</Badge>
          <Badge size="small">View Log</Badge>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell class="text-left">Very Important Files</TableCell>
        <TableCell class="text-right">
          <Badge size="small" color="danger">Failed 3 days ago</Badge>
          <Badge size="small">View Log</Badge>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</Stack>
