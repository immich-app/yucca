<script lang="ts">
  import * as d3 from "d3";

  type Props = {
    data: { name: string; value: number }[];
    colours: string[];
  };

  const { data, colours }: Props = $props();

  const width = 400;
  const height = 300;
  const radius = Math.min(width, height) / 2 - 50;

  const colourScale = d3
    .scaleOrdinal<string>()
    .domain(data.map((d) => d.name))
    .range(
      colours ??
        d3
          .quantize((t) => d3.interpolateSpectral(t * 0.8 + 0.1), data.length)
          .reverse(),
    );

  type Datum = { name: string; value: number };

  const pie = d3
    .pie<Datum>()
    .sort(null)
    .value((d) => d.value);

  const arcPath = d3
    .arc<d3.PieArcDatum<Datum>>()
    .innerRadius(0)
    .outerRadius(radius);

  const outerArc = d3
    .arc<d3.PieArcDatum<Datum>>()
    .innerRadius(radius * 1.1)
    .outerRadius(radius * 1.1);

  const arcs = pie(data);

  function midAngle(d: d3.PieArcDatum<Datum>) {
    return d.startAngle + (d.endAngle - d.startAngle) / 2;
  }
</script>

<svg
  viewBox="{-width / 2}, {-height / 2}, {width}, {height}"
  style:max-width="100%"
  style:height="auto"
>
  <g class="data">
    {#each arcs as slice}
      <path
        d={arcPath(slice)}
        fill={colourScale(slice.data.name)}
        stroke="white"
      >
        <title
          >{slice.data.name}: {slice.data.value.toLocaleString("en-US")}</title
        >
      </path>

      {@const pos = outerArc.centroid(slice)}
      {@const isRight = midAngle(slice) < Math.PI}
      <text
        transform="translate({[pos[0] + (isRight ? 5 : -5), pos[1]]})"
        text-anchor={isRight ? "start" : "end"}
        dominant-baseline="central"
      >
        {slice.data.name}
      </text>
    {/each}
  </g>
</svg>
