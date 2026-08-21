// Package ui is the terminal presentation layer. Commands write through an
// IOStreams instead of os.Stdout/os.Stderr so tests can capture output; Out
// is for the command's payload (parseable, redirectable), Err for progress
// and human-only chatter.
package ui

import (
	"io"
	"os"
)

type IOStreams struct {
	In  io.Reader
	Out io.Writer
	Err io.Writer
}

func System() *IOStreams {
	return &IOStreams{In: os.Stdin, Out: os.Stdout, Err: os.Stderr}
}
