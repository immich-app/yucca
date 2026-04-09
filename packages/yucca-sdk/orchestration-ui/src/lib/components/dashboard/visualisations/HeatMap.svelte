<script lang="ts">
  import * as d3 from "d3";

  type Datum = {
    row: string;
    col: string;
    value: number;
  };

  type Props = {
    data: Datum[];
    rows: string[];
    cols: string[];
    colours: [string, string];
  };

  const { data, rows, cols, colours }: Props = $props();

  const width = 400;
  const height = 300;
  const marginTop = 10;
  const marginRight = 10;
  const marginBottom = 30;
  const marginLeft = 35;

  // svelte-ignore state_referenced_locally
  const xScale = d3
    .scaleBand()
    .domain(cols)
    .range([marginLeft, width - marginRight])
    .padding(0.1);

  // svelte-ignore state_referenced_locally
  const yScale = d3
    .scaleBand()
    .domain(rows)
    .range([marginTop, height - marginBottom])
    .padding(0.1);

  // svelte-ignore state_referenced_locally
  const maxValue = d3.max(data, (d) => d.value) ?? 1;

  // svelte-ignore state_referenced_locally
  const valueMap = new Map(data.map((d) => [`${d.row}:${d.col}`, d.value]));

  function intensity(value: number): number {
    return maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
  }

  // svelte-ignore state_referenced_locally
  const labelInterval = Math.max(1, Math.ceil(cols.length / 8));

  let hovered = $state<{ row: string; col: string } | null>(null);
  let tooltip = $state<{
    x: number;
    y: number;
    row: string;
    col: string;
    value: number;
  } | null>(null);

  function onCellEnter(row: string, col: string, value: number, e: MouseEvent) {
    hovered = { row, col };
    tooltip = { x: e.clientX, y: e.clientY, row, col, value };
  }

  function onCellMove(e: MouseEvent) {
    if (!tooltip) return;
    tooltip = { ...tooltip, x: e.clientX, y: e.clientY };
  }

  function onCellLeave() {
    hovered = null;
    tooltip = null;
  }
</script>

<div>
  <svg
    viewBox="0 0 {width} {height}"
    style:max-width="100%"
    style:height="auto"
  >
    {#each rows as row}
      {#each cols as col}
        {@const value = valueMap.get(`${row}:${col}`) ?? 0}
        {@const isHovered = hovered?.row === row && hovered?.col === col}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <rect
          x={xScale(col)}
          y={yScale(row)}
          width={xScale.bandwidth()}
          height={yScale.bandwidth()}
          rx={2}
          ry={2}
          style="fill: color-mix(in oklch, {colours[1]} {intensity(
            value,
          )}%, {colours[0]}); transition: opacity 150ms;"
          opacity={hovered === null || isHovered ? 1 : 0.4}
          stroke={isHovered ? "currentColor" : "none"}
          stroke-width={isHovered ? 1.5 : 0}
          onmouseenter={(e) => onCellEnter(row, col, value, e)}
          onmousemove={onCellMove}
          onmouseleave={onCellLeave}
        />
      {/each}
    {/each}

    <g>
      {#each rows as row}
        <text
          fill="currentColor"
          text-anchor="end"
          dominant-baseline="central"
          x={marginLeft - 6}
          y={(yScale(row) ?? 0) + yScale.bandwidth() / 2}
          font-size="11"
        >
          {row}
        </text>
      {/each}
    </g>

    <g transform="translate(0,{height - marginBottom})">
      {#each cols as col, i}
        {#if i % labelInterval === 0}
          <text
            fill="currentColor"
            text-anchor="middle"
            x={(xScale(col) ?? 0) + xScale.bandwidth() / 2}
            y={18}
            font-size="11"
          >
            {col}
          </text>
        {/if}
      {/each}
    </g>
  </svg>

  {#if tooltip}
    <div
      style="
        position: fixed;
        left: {tooltip.x + 12}px;
        top: {tooltip.y - 8}px;
        background: var(--immich-ui-dark);
        color: var(--immich-ui-light);
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 0.75rem;
        pointer-events: none;
        white-space: nowrap;
        z-index: 10;
      "
    >
      <div style="font-weight: 600;">{tooltip.row} {tooltip.col}</div>
      <div>{tooltip.value} {tooltip.value === 1 ? "job" : "jobs"}</div>
    </div>
  {/if}
</div>

<div
  style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 4px;"
>
  <span style="font-size: 0.8rem;">Less</span>
  {#each [0, 25, 50, 75, 100] as pct}
    <span
      style="display: inline-block; width: 12px; height: 12px; border-radius: 2px; background: color-mix(in oklch, {colours[1]} {pct}%, {colours[0]});"
    ></span>
  {/each}
  <span style="font-size: 0.8rem;">More</span>
</div>
