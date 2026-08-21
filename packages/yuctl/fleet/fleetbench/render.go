package fleetbench

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"text/tabwriter"

	"yuctl/resticbench"
)

// ShortName drops the shared fleet prefix so tables stay narrow.
func ShortName(name string) string {
	return strings.TrimPrefix(name, "yucca-bench-")
}

func SaveResult(path string, r *Result) error {
	b, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

func RenderResult(w io.Writer, r *Result) {
	fmt.Fprintf(w, "\n%s  partition=%s  elapsed=%s\n", r.Label, r.Partition, resticbench.FormatDuration(r.ElapsedSeconds))
	tw := tabwriter.NewWriter(w, 2, 4, 2, ' ', 0)
	fmt.Fprintln(tw, "HOST\tREGION\tSTATE\tWIRE TX\tCLIENT\tCYCLES\tUPLOADED\tERRORS")
	for _, d := range r.Hosts {
		if len(d.Clients) == 0 {
			fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t-\t-\t-\t-\n",
				ShortName(d.Name), d.Region, d.State, resticbench.FormatBytes(d.WireTxBytes))
			continue
		}
		for i, c := range d.Clients {
			name, region, state, wireTx := ShortName(d.Name), d.Region, d.State, resticbench.FormatBytes(d.WireTxBytes)
			if i > 0 {
				name, region, state, wireTx = "", "", "", ""
			}
			fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t%s\t%d\t%s\t%d\n",
				name, region, state, wireTx, "c"+strings.TrimPrefix(c.Name, d.Name+"-c"), c.Cycles,
				resticbench.FormatBytes(c.Uploaded), c.Errors)
		}
	}
	tw.Flush()
	fmt.Fprintf(w, "totals: uploaded=%s  wire-tx=%s  cycles=%d  errors=%d",
		resticbench.FormatBytes(r.TotalUploaded), resticbench.FormatBytes(r.TotalWireTx), r.TotalCycles, r.TotalErrors)
	if r.ElapsedSeconds > 0 && r.TotalUploaded > 0 {
		fmt.Fprintf(w, "  avg=%s", resticbench.FormatBPS(float64(r.TotalUploaded)/r.ElapsedSeconds))
	}
	fmt.Fprintln(w)
}
