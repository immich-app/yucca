// Package ui owns everything yuctl presents to the operator: the IO streams
// commands write to (so command logic never touches os.Stdout directly and
// tests can capture output), and — for the dashboard-style commands — the
// shared lipgloss theme and terminal widgets.
package ui

import (
	"io"
	"os"
)

// IOStreams carries a command's input and output streams. Out is for the
// command's payload (parseable, redirectable); Err is for progress and
// human-only chatter.
type IOStreams struct {
	In  io.Reader
	Out io.Writer
	Err io.Writer
}

// System returns the process's real streams.
func System() *IOStreams {
	return &IOStreams{In: os.Stdin, Out: os.Stdout, Err: os.Stderr}
}
