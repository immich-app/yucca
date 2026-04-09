<script lang="ts">
  import * as d3 from "d3";

  type Datum = Record<string, string | number>;

  type Props = {
    data: Datum[];
    categoryKey: string;
    keys: string[];
    colours: string[];
    formatValue?: (value: number) => string;
  };

  const { data, categoryKey, keys, colours, formatValue }: Props = $props();

  const fmt = (v: number) =>
    formatValue ? formatValue(v) : v.toLocaleString("en-US");

  const width = 400;
  const height = 300;
  const marginTop = 20;
  const marginRight = 10;
  const marginBottom = 40;
  const series = d3
    .stack<Datum>()
    .keys(keys)
    .value((d, key) => (d[key] as number) ?? 0)(data);

  const categories = data.map((d) => String(d[categoryKey]));

  const yScale = d3
    .scaleLinear()
    .domain([0, d3.max(series, (s) => d3.max(s, (d) => d[1])) ?? 0])
    .nice()
    .range([height - marginBottom, marginTop]);

  const ticks = yScale.ticks(5);
  const tickLabels = ticks.map((t) => fmt(t));

  function measureText(labels: string[]): number {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return Math.max(...labels.map((l) => l.length)) * 9;
    ctx.font = "16px sans-serif";
    return Math.max(...labels.map((l) => ctx.measureText(l).width));
  }

  const marginLeft = Math.ceil(measureText(tickLabels)) + 12;

  const xScale = d3
    .scaleBand()
    .domain(categories)
    .range([marginLeft, width - marginRight])
    .padding(0.5);

  const colourScale = d3.scaleOrdinal<string>().domain(keys).range(colours);

  let hoveredCat = $state<string | null>(null);
  let tooltip = $state<{
    x: number;
    y: number;
    cat: string;
    values: { key: string; value: number }[];
  } | null>(null);

  function onBarEnter(cat: string, e: MouseEvent) {
    hoveredCat = cat;
    const values = keys.map((key) => {
      const datum = data.find((d) => String(d[categoryKey]) === cat);
      return { key, value: (datum?.[key] as number) ?? 0 };
    });
    tooltip = { x: e.clientX, y: e.clientY, cat, values };
  }

  function onBarMove(e: MouseEvent) {
    if (!tooltip) return;
    tooltip = { ...tooltip, x: e.clientX, y: e.clientY };
  }

  function onBarLeave() {
    hoveredCat = null;
    tooltip = null;
  }
</script>

<div>
  <svg
    viewBox="0 0 {width} {height}"
    style:max-width="100%"
    style:height="auto"
  >
    {#each series as layer}
      <g fill={colourScale(layer.key)}>
        {#each layer as d}
          {@const cat = String(d.data[categoryKey])}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <rect
            x={xScale(cat)}
            y={yScale(d[1])}
            height={yScale(d[0]) - yScale(d[1])}
            width={xScale.bandwidth()}
            opacity={hoveredCat === null || hoveredCat === cat ? 1 : 0.3}
            style="transition: opacity 150ms;"
            onmouseenter={(e) => onBarEnter(cat, e)}
            onmousemove={onBarMove}
            onmouseleave={onBarLeave}
          />
        {/each}
      </g>
    {/each}

    <g transform="translate(0,{height - marginBottom})">
      <line stroke="currentColor" x1={marginLeft} x2={width - marginRight} />

      {#each categories as cat}
        <text
          fill="currentColor"
          text-anchor="middle"
          x={(xScale(cat) ?? 0) + xScale.bandwidth() / 2}
          y={22}
        >
          {cat}
        </text>
      {/each}
    </g>

    <g>
      {#each ticks as tick}
        {#if tick !== 0}
          <line
            stroke="currentColor"
            x1={marginLeft}
            x2={marginLeft - 6}
            y1={yScale(tick)}
            y2={yScale(tick)}
          />
        {/if}

        <text
          fill="currentColor"
          text-anchor="end"
          dominant-baseline="middle"
          x={marginLeft - 9}
          y={yScale(tick)}
        >
          {fmt(tick)}
        </text>
      {/each}
    </g>
  </svg>

  {#if tooltip}
    <div
      class="tooltip"
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
      <div style="font-weight: 600; margin-bottom: 2px;">{tooltip.cat}</div>
      {#each tooltip.values as v}
        <div style="display: flex; align-items: center; gap: 6px;">
          <span
            style="width: 8px; height: 8px; border-radius: 2px; background: {colourScale(
              v.key,
            )};"
          ></span>
          {v.key}: {fmt(v.value)}
        </div>
      {/each}
    </div>
  {/if}
</div>

<div
  style="display: flex; justify-content: center; gap: 16px; margin-top: 4px;"
>
  {#each keys as key}
    <div style="display: flex; align-items: center; gap: 4px;">
      <span
        style="display: inline-block; width: 12px; height: 12px; background: {colourScale(
          key,
        )}; border-radius: 2px;"
      ></span>
      <span style="font-size: 0.8rem;">{key}</span>
    </div>
  {/each}
</div>
