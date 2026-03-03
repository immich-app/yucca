package main

import (
	"testing"
)

func TestIsPreconditionFailed_NilError(t *testing.T) {
	if isPreconditionFailed(nil) {
		t.Error("expected false for nil error")
	}
}

func TestIsPreconditionFailed_GenericError(t *testing.T) {
	err := &genericError{msg: "some error"}
	if isPreconditionFailed(err) {
		t.Error("expected false for generic error")
	}
}

func TestIsPreconditionFailed_412Error(t *testing.T) {
	err := &httpError{statusCode: 412}
	if !isPreconditionFailed(err) {
		t.Error("expected true for 412 error")
	}
}

func TestIsPreconditionFailed_404Error(t *testing.T) {
	err := &httpError{statusCode: 404}
	if isPreconditionFailed(err) {
		t.Error("expected false for 404 error")
	}
}

// test helpers

type genericError struct {
	msg string
}

func (e *genericError) Error() string { return e.msg }

type httpError struct {
	statusCode int
}

func (e *httpError) Error() string            { return "http error" }
func (e *httpError) HTTPStatusCode() int      { return e.statusCode }
