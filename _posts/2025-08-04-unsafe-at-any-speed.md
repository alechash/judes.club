---
title: "Unsafe at Any Speed: 249,000 requests per second with Go"
date: 2025-08-04
tags: [go, performance, engineering]
description: >-
  How far can you push Go's HTTP stack before it falls over? I built a
  benchmarking client that hit 249,000 requests per second on localhost — and
  stayed crash-proof the whole way.
---

I didn't want this thing to be safe. I wanted it to be fast — and if it was going to crash, I wanted it to crash *gracefully*, at a hundred thousand requests per second.

That was the whole question I started with: how much performance can you pull out of Go's HTTP stack before it falls apart? And can you keep it from falling apart at all, even while you're using the parts of the language you're explicitly told never to touch?

What came out of it was an ultra-high-performance HTTP benchmarking client, written in Go, that hits **249,000 requests per second on localhost** and **17,000+ over a real network** — with zero panics and zero memory leaks across every run.

## Where the standard library taps out

Before any of the unsafe stuff, I tried to do this the normal way.

Go's standard `net/http` client is good. It is not *this* fast. Even with connection reuse and tuning, I couldn't get it past roughly **9,000 RPS**. Turn keep-alives off and it collapsed to under **3,000**. The bottleneck isn't really Go — it's all the correctness and safety work `net/http` does on every single request. That's exactly what you want in production, and exactly what's in your way in a benchmarking tool.

So I stopped using it.

## What I built instead

The client manages its own connections: **512 concurrent workers** sharing a pool of **1,024 persistent TCP connections**. Nothing reconnects mid-run, so connection setup never shows up in the numbers.

Each connection is deliberately bare:

```go
type UnsafeConnection struct {
    conn      net.Conn
    buffer    []byte
    bufferPtr unsafe.Pointer
    isReady   int64
}
```

To kill garbage collection pressure, request and response buffers are preallocated and reused, and the response path uses zero-copy byte slices built straight from a pointer:

```go
func safeUnsafeByteSlice(ptr unsafe.Pointer, length int) []byte {
    if ptr == nil || length <= 0 {
        return make([]byte, 0)
    }
    return *(*[]byte)(unsafe.Pointer(&reflect.SliceHeader{
        Data: uintptr(ptr),
        Len:  length,
        Cap:  length,
    }))
}
```

This is the part Go tells you not to do. `reflect.SliceHeader`, raw `unsafe.Pointer` work — it steps around the memory model entirely. It is fast, and it is genuinely dangerous.

## Crash-proof on purpose

Using `unsafe` means accepting that something *will* eventually go wrong. The answer wasn't to make the unsafe code safe — it was to contain the blast radius. Every worker runs its hot loop inside a `recover()`:

```go
func (worker *UnsafeWorker) safeWorkerLoop(client *UnsafeBenchmarkClient) {
    defer func() {
        if r := recover(); r != nil {
            // Log and keep going
        }
    }()
    // Write request, read response, track success/errors
}
```

If one worker hits something nasty, it logs it and the other 511 keep running. That's the whole idea: unsafe in the small, stable in the large.

## Measuring it honestly

A single fast number is easy to fake. So the harness runs **15 full benchmark cycles** and reports the spread:

```go
func RunCrashProofUnsafeBenchmark() {
    for i := 0; i < NUM_BENCHMARKS; i++ {
        // Launch all workers with sync.WaitGroup
        // Sleep for the benchmark duration
        // Collect all request counts
        // Calculate RPS, mean, median, stddev, etc.
    }
}
```

For each run it records the request rate, then computes mean, median, and standard deviation across all 15. The number I actually trust is the **coefficient of variation** — standard deviation as a percentage of the mean — because it tells you whether a result is repeatable or a fluke:

- under 5% — excellent
- under 10% — good
- under 20% — moderate
- over 20% — poor

A representative run looked like this:

```
Run 1:   248,210 req/s
Run 2:   249,379 req/s
Run 3:   247,844 req/s
...
Mean:                 248,477 req/s
Median:               248,210 req/s
Std deviation:            637 req/s
Coefficient of var.:     0.26%
```

A 0.26% coefficient of variation means 249,000 RPS isn't a lucky spike. It's just where this thing lives.

## A real safety notice

To be clear about what this is: if you're building production software, do not do any of this. The `unsafe` package, a hand-rolled connection pool, zero-copy slices off raw pointers — that's a recipe for memory corruption.

This is a tool for exactly one job: generating load. Load generators, stress testers, and "how hard can I push this" experiments are where these tradeoffs are actually worth making, because the tool is the thing under your control, and the safety you're giving up was protecting *you*, not your users.

## Why bother

Mostly, I just wanted to know the answer. Go gets called fast, and it is — but "fast" usually means "fast with the seatbelt on." I wanted to see what was underneath it.

The answer is that Go has a lot more headroom than its standard library will hand you, and you can reach it without giving up stability — as long as you're deliberate about where the danger lives and where it doesn't. 249,000 requests per second, zero panics, zero leaks. You just have to be willing to leave the guardrails behind, and smart enough to put a net under the exact spot where you jump.

*The code lives on [my GitHub](https://github.com/alechash).*
