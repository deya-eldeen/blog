---
layout: post
hidden: true
title: "Streaming Responses and Incremental Parsing"
date: "2026-10-12"
last_modified_at: "2026-10-12"
permalink: /swift-streaming-responses/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Networking, Streaming, AsyncSequence]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Most responses are read whole: wait for the last byte, then decode. Some responses are worth reading while they arrive. A search that returns results as the server finds them, a log tail, a progress feed for a server-side job, or a language model generating text token by token all have the same shape: the first useful piece exists long before the last one, and a client that waits for the end throws away the head start.

`URLSession.bytes(for:)` makes the bytes available as an `AsyncSequence` as soon as they arrive. Turning bytes into values is the hard part, because the network does not respect message boundaries: a JSON record, a UTF-8 character, or an event can be split anywhere. This article covers the three streaming formats an app is most likely to meet: newline-delimited JSON, Server-Sent Events, and a large JSON array parsed element by element. It measures the details that decide whether a streaming client works: when bytes are delivered, what `AsyncBytes.lines` does with empty lines, what happens when the consumer is slow, and what breaking out of the loop actually stops.

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. They send requests to `LocalServer`, the loopback HTTP server from the [appendix of the first article](/swift-http-methods-status-codes-headers/#appendix-the-local-server-used-in-this-series); paste that code first, then the blocks below in order, into one `main.swift`. [Consuming Values with `AsyncSequence`](/swift-asyncsequence/) covers the protocol itself.

<!-- check-uses: local-server -->

## Delivery: when bytes become available

Two things stand between the server's write and the client's loop. One is the server's own buffering, which is outside the client's control. The other is `URLSession`'s content sniffing, measured in [Requests and Responses with `async` and `await`](/swift-urlsession-async-await/): for a response with no `Content-Type` or with `text/plain`, delivery waits for 512 bytes or the end of the body. Streaming formats have registered media types that are not sniffed, `application/x-ndjson` and `text/event-stream`, and a streaming server must send them.

The server below emits five records 100 ms apart, with chunked transfer encoding because the total length is unknown when it starts, which is what makes streaming possible over HTTP/1.1:

```swift
import Foundation
import Synchronization
import Darwin

struct Hit: Decodable, Equatable, Sendable {
    let id: Int
    let title: String
}

let server = try await LocalServer.start { request in
    switch request.path {
    case "/search":
        var pieces: [HTTPResponse.Piece] = []
        for index in 1...5 {
            pieces += [.pause(.milliseconds(100)), .bytes(Data((#"{"id":\#(index),"title":"Result \#(index)"}"# + "\n").utf8))]
        }
        return HTTPResponse(status: 200, headers: [("Content-Type", request.query["type"] ?? "application/x-ndjson")],
                            body: pieces, chunked: true)
    default:
        return .text("not found", status: 404)
    }
}

func searchURL(type: String) -> URL {
    var components = URLComponents(url: server.baseURL.appending(path: "search"), resolvingAgainstBaseURL: false)!
    components.queryItems = [URLQueryItem(name: "type", value: type)]
    return components.url!
}

func arrivals(type: String) async throws -> [Duration] {
    let start = ContinuousClock.now
    let (bytes, _) = try await URLSession.shared.bytes(from: searchURL(type: type))
    var times: [Duration] = []
    for try await line in bytes.lines {
        _ = try JSONDecoder().decode(Hit.self, from: Data(line.utf8))
        times.append(ContinuousClock.now - start)
    }
    return times
}

let streamed = try await arrivals(type: "application/x-ndjson")
let sniffed = try await arrivals(type: "text/plain")
print("ndjson:", streamed, "\ntext/plain:", sniffed)
assert(streamed.count == 5 && streamed[0] < .milliseconds(250))   // the first result after ~100 ms
assert(sniffed.count == 5 && sniffed[0] > .milliseconds(450))     // held back until the body ended
```

With the right type, the first result was decoded about 100 ms after the request started and the rest followed at 100 ms intervals. With `text/plain`, all five arrived together after half a second, because the five records add up to less than 512 bytes: a "streaming" endpoint that behaves exactly like a normal one, for a reason that is invisible in the client's code.

## Bytes are not characters

The network splits data wherever it likes, including in the middle of a multi-byte UTF-8 character. Code that decodes each received chunk separately, which is easy to write with a data-task delegate that receives `Data` pieces, turns split characters into replacement characters:

```swift
let text = "Café ☕ résumé"
let bytes = Array(text.utf8)
let split = bytes.firstIndex(of: 0xE2)! + 1   // inside the three-byte encoding of ☕
let chunks = [Data(bytes[..<split]), Data(bytes[split...])]

let perChunk = chunks.map { String(decoding: $0, as: UTF8.self) }.joined()
assert(perChunk != text && perChunk.contains("\u{FFFD}"))   // corrupted at the boundary

var assembled = Data()
chunks.forEach { assembled.append($0) }
assert(String(decoding: assembled, as: UTF8.self) == text)   // decode only complete sequences
```

`AsyncBytes` delivers one byte at a time, and its `.characters`, `.unicodeScalars`, and `.lines` views decode across chunk boundaries correctly, so this bug cannot happen with them. It reappears whenever code buffers bytes into its own chunks: decode at message boundaries, which for every format below is a newline or a delimiter that is a single ASCII byte, never at arbitrary chunk boundaries.

## `lines` drops empty lines

`AsyncBytes.lines` is the obvious way to read line-based formats. What it considers a line matters, so it is worth measuring with every kind of line ending and some empty lines:

```swift
let lineServer = try await LocalServer.start { _ in
    HTTPResponse(status: 200, headers: [("Content-Type", "text/event-stream")],
                 body: [.bytes(Data("a\n\nb\r\n\r\nc\rd\n\n\ne".utf8))])
}
let (lineBytes, _) = try await URLSession.shared.bytes(from: lineServer.baseURL)
var lines: [String] = []
for try await line in lineBytes.lines { lines.append(line) }
assert(lines == ["a", "b", "c", "d", "e"])   // every empty line is gone
```

It accepts `\n`, `\r\n`, and a lone `\r` as line endings, which is generous and correct. It also **skips every empty line**. For newline-delimited JSON that is harmless, since empty lines carry nothing. For Server-Sent Events it is fatal: an empty line is the signal that an event is complete, and a parser built on `.lines` never sees it. The SSE parser below therefore splits lines itself.

## Server-Sent Events

Server-Sent Events, specified in the [HTML Standard](https://html.spec.whatwg.org/multipage/server-sent-events.html), are a simple, one-way streaming protocol over plain HTTP. The body is `text/event-stream`, a sequence of lines grouped into events by empty lines:

```text
: comments start with a colon and are ignored
event: availability
id: 41
data: {"book":"b-7","copies":2}

data: first line
data: second line

retry: 5000
```

Each line is `field: value`. `data` lines accumulate, joined with newlines; `event` sets the event's type; `id` sets the last event ID that a reconnecting client sends back in a `Last-Event-ID` header; `retry` sets the reconnection delay in milliseconds. An empty line dispatches the event built so far. The rules have a few precise details, such as that a single space after the colon is removed but further spaces are kept, that a line without a colon is a field name with an empty value, and that an event with no data is not dispatched. The parser below follows them, and reads raw bytes so it can see empty lines:

```swift
struct ServerSentEvent: Equatable, Sendable {
    var type = "message"
    var data = ""
    var id: String?
}

struct SSEParser {
    private var data: [String] = []
    private var type = ""
    private(set) var lastEventID: String?
    private(set) var retry: Duration?
    private var line: [UInt8] = []
    private var previousWasCR = false

    /// Feeds one byte; returns an event when a blank line completes one.
    mutating func feed(_ byte: UInt8) -> ServerSentEvent? {
        if previousWasCR && byte == 0x0A { previousWasCR = false; return nil }  // the LF of a CRLF
        previousWasCR = byte == 0x0D
        guard byte == 0x0A || byte == 0x0D else { line.append(byte); return nil }
        defer { line.removeAll(keepingCapacity: true) }
        return process(String(decoding: line, as: UTF8.self))
    }

    private mutating func process(_ text: String) -> ServerSentEvent? {
        if text.isEmpty { return dispatch() }
        if text.hasPrefix(":") { return nil }  // comment
        let field: Substring
        var value: Substring
        if let colon = text.firstIndex(of: ":") {
            field = text[..<colon]
            value = text[text.index(after: colon)...]
            if value.hasPrefix(" ") { value = value.dropFirst() }
        } else {
            (field, value) = (text[...], "")
        }
        switch field {
        case "data": data.append(String(value))
        case "event": type = String(value)
        case "id" where !value.contains("\0"): lastEventID = String(value)
        case "retry": if let milliseconds = Int(value) { retry = .milliseconds(milliseconds) }
        default: break
        }
        return nil
    }

    private mutating func dispatch() -> ServerSentEvent? {
        defer { data.removeAll(); type = "" }
        guard !data.isEmpty else { return nil }
        return ServerSentEvent(type: type.isEmpty ? "message" : type, data: data.joined(separator: "\n"), id: lastEventID)
    }
}

func parse(_ text: String) -> (events: [ServerSentEvent], parser: SSEParser) {
    var parser = SSEParser()
    var events: [ServerSentEvent] = []
    for byte in text.utf8 { if let event = parser.feed(byte) { events.append(event) } }
    return (events, parser)
}

let sample = ": keep-alive\r\nevent: availability\r\nid: 41\r\ndata: {\"book\":\"b-7\"}\r\n\r\ndata: first line\ndata:  second line\n\nretry: 5000\n\ndata\n\nevent: ignored\n\n"
let (sampleEvents, sampleParser) = parse(sample)
assert(sampleEvents == [
    ServerSentEvent(type: "availability", data: #"{"book":"b-7"}"#, id: "41"),
    ServerSentEvent(type: "message", data: "first line\n second line", id: "41"),  // one leading space removed
    ServerSentEvent(type: "message", data: "", id: "41"),                          // "data" without a colon
])
assert(sampleParser.retry == .milliseconds(5000) && sampleParser.lastEventID == "41")
```

The last event in the sample, `event: ignored` followed by a blank line, produced nothing, because it had no `data` field. The third event, a bare `data` line, is dispatched with empty data, which the specification treats as distinct from no data. Running the parser over a live stream is a loop over `AsyncBytes`:

```swift
let sse = try await LocalServer.start { request in
    var pieces: [HTTPResponse.Piece] = [.bytes(Data(": connected\n\n".utf8))]
    let start = Int(request.header("Last-Event-ID") ?? "0") ?? 0
    for id in (start + 1)...(start + 3) {
        pieces += [.pause(.milliseconds(80)),
                   .bytes(Data("event: availability\nid: \(id)\ndata: {\"copies\":\(id)}\n\n".utf8))]
    }
    return HTTPResponse(status: 200, headers: [("Content-Type", "text/event-stream"), ("Cache-Control", "no-store")],
                        body: pieces, chunked: true)
}

func listen(lastEventID: String?) async throws -> (events: [ServerSentEvent], firstAfter: Duration) {
    var request = URLRequest(url: sse.baseURL.appending(path: "events"))
    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
    if let lastEventID { request.setValue(lastEventID, forHTTPHeaderField: "Last-Event-ID") }
    let start = ContinuousClock.now
    let (bytes, _) = try await URLSession.shared.bytes(for: request)
    var parser = SSEParser()
    var events: [ServerSentEvent] = []
    var firstAfter = Duration.zero
    for try await byte in bytes {
        if let event = parser.feed(byte) {
            if events.isEmpty { firstAfter = ContinuousClock.now - start }
            events.append(event)
        }
    }
    return (events, firstAfter)
}

let firstConnection = try await listen(lastEventID: nil)
assert(firstConnection.events.map(\.id) == ["1", "2", "3"] && firstConnection.firstAfter < .milliseconds(200))
let resumed = try await listen(lastEventID: firstConnection.events.last?.id)
assert(resumed.events.map(\.id) == ["4", "5", "6"])  // the server continued after the last seen event
```

The `Last-Event-ID` mechanism is what makes SSE recoverable where a raw WebSocket is not: the client tells the server where it stopped, and the server resumes from there. The reconnecting connection manager in [WebSockets: Connection State and Reconnection](/swift-websockets-reconnection/) applies directly to SSE too, with `retry` from the stream as the backoff floor.

## A large JSON array, one element at a time

APIs that were not designed for streaming still often return large arrays: `[{...}, {...}, ...]`, thousands of elements, several megabytes. `JSONDecoder` needs the whole document. A small scanner can find the boundaries of top-level elements while the bytes arrive, by tracking nesting depth and whether it is inside a string, so each element can be decoded as soon as it is complete:

```swift
struct ArrayElementScanner {
    private var depth = 0
    private var inString = false
    private var escaped = false
    private var element: [UInt8] = []

    /// Feeds one byte of a JSON array; returns the bytes of a complete top-level element.
    mutating func feed(_ byte: UInt8) -> Data? {
        if inString {
            element.append(byte)
            if escaped { escaped = false } else if byte == UInt8(ascii: "\\") { escaped = true } else if byte == UInt8(ascii: "\"") { inString = false }
            return nil
        }
        switch byte {
        case UInt8(ascii: "["), UInt8(ascii: "{"):
            depth += 1
            if depth > 1 { element.append(byte) }
        case UInt8(ascii: "]"), UInt8(ascii: "}"):
            depth -= 1
            if depth >= 1 { element.append(byte) }
            if depth == 1 && byte == UInt8(ascii: "}") { return take() }
            if depth == 0 { return element.isEmpty ? nil : take() }
        case UInt8(ascii: ","):
            if depth == 1 { return element.isEmpty ? nil : take() }
            element.append(byte)
        case UInt8(ascii: "\""):
            inString = true
            element.append(byte)
        case 0x20, 0x0A, 0x0D, 0x09:
            if depth > 1 { element.append(byte) }
        default:
            element.append(byte)
        }
        return nil
    }

    private mutating func take() -> Data {
        defer { element.removeAll(keepingCapacity: true) }
        return Data(element)
    }
}

let tricky = #"[ {"id":1,"title":"Braces { and ] in a string"}, {"id":2,"title":"Escaped \" quote"} ,{"id":3,"title":"Ünïcode ☕"} ]"#
var scanner = ArrayElementScanner()
let elements = tricky.utf8.compactMap { scanner.feed($0) }
let decodedHits = try elements.map { try JSONDecoder().decode(Hit.self, from: $0) }
assert(decodedHits.map(\.id) == [1, 2, 3] && decodedHits[0].title == "Braces { and ] in a string")
assert(decodedHits[2].title == "Ünïcode ☕")
```

The scanner handles braces and brackets inside strings, escaped quotes, and whitespace between elements. It returns an element when its closing `}` brings the depth back to the array level, and handles scalars such as numbers in an array at the following comma or `]`. It does not validate JSON; each element is validated when it is decoded, so a malformed element fails on its own, which is the lossy behavior from [Decoding JSON with `Codable`](/swift-decoding-json-codable/) for free.

Against a server that sends a 2,000-element array in 50 pieces with a short pause between pieces, the first element is available long before the last byte:

```swift
let arrayServer = try await LocalServer.start { _ in
    let items = (1...2_000).map { #"{"id":\#($0),"title":"Book number \#($0)"}"# }
    let document = Data(("[" + items.joined(separator: ",") + "]").utf8)
    let pieceSize = document.count / 50 + 1
    var pieces: [HTTPResponse.Piece] = []
    for start in stride(from: 0, to: document.count, by: pieceSize) {
        pieces += [.bytes(document[start..<min(start + pieceSize, document.count)]), .pause(.milliseconds(10))]
    }
    return HTTPResponse(status: 200, headers: [("Content-Type", "application/json")], body: pieces, chunked: true)
}

func streamArray() async throws -> (count: Int, firstAfter: Duration, total: Duration) {
    let start = ContinuousClock.now
    let (bytes, _) = try await URLSession.shared.bytes(from: arrayServer.baseURL)
    var scanner = ArrayElementScanner()
    var count = 0
    var firstAfter = Duration.zero
    for try await byte in bytes {
        guard let element = scanner.feed(byte) else { continue }
        _ = try JSONDecoder().decode(Hit.self, from: element)
        if count == 0 { firstAfter = ContinuousClock.now - start }
        count += 1
    }
    return (count, firstAfter, ContinuousClock.now - start)
}

let streamedArray = try await streamArray()
print("2,000 elements: first after \(streamedArray.firstAfter), all after \(streamedArray.total)")
assert(streamedArray.count == 2_000)
assert(streamedArray.firstAfter * 5 < streamedArray.total)
```

The first book was ready a few milliseconds into a transfer that lasted more than half a second. A list screen can show its first rows immediately and keep appending, instead of showing a spinner for the full download.

## Slow consumers, cancellation, and cost

A streaming client is a pipeline, and three properties of the pipeline need checking: what happens when the consumer cannot keep up, what stops the transfer, and what each byte costs.

**Backpressure.** When the loop stops pulling bytes, `URLSession` does not keep reading the socket into memory without limit. With a server ready to send 100 MB and a consumer paused for two seconds after the first byte, the process's physical footprint grew by about 5 MB in this measurement. Beyond that buffer, TCP flow control pushes back to the server. A slow consumer slows the transfer instead of exhausting memory.

**Stopping.** Breaking out of the `for try await` loop does *not* end the request. The `AsyncBytes` value still owns a running task, and the transfer continues until that value is released, at the end of the scope that holds it:

```swift
let feed = try await LocalServer.start { _ in
    var pieces: [HTTPResponse.Piece] = []
    for index in 0..<50 { pieces += [.bytes(Data((#"{"n":\#(index)}"# + "\n").utf8)), .pause(.milliseconds(100))] }
    return HTTPResponse(status: 200, headers: [("Content-Type", "application/x-ndjson")], body: pieces, chunked: true)
}

func takeThree(cancelling: Bool) async throws -> URLSessionTask.State {
    let (bytes, _) = try await URLSession.shared.bytes(from: feed.baseURL)
    var count = 0
    for try await _ in bytes.lines {
        count += 1
        if count == 3 { break }
    }
    if cancelling { bytes.task.cancel() }
    try await Task.sleep(for: .milliseconds(200))
    return bytes.task.state
}

let afterBreak = try await takeThree(cancelling: false)
let afterCancel = try await takeThree(cancelling: true)
assert(afterBreak == .running)      // the 5-second stream is still open
assert(afterCancel == .completed)
```

In a function that returns right after the loop, release comes soon. In a long-lived object that keeps the `AsyncBytes` around, or in a loop that breaks and then does more work, the connection stays open. Cancel `bytes.task` explicitly when you are done with a stream early; cancelling the enclosing Swift task works too, as [Requests and Responses with `async` and `await`](/swift-urlsession-async-await/) showed.

**Cost per byte.** Iterating `AsyncBytes` one byte at a time is cheap in an optimized build and expensive in a debug build, where each step of the async iterator is a real function call:

| 50 MB over loopback | `-O` | `-Onone` (debug) |
|---|---|---|
| `for try await byte in bytes` | 0.05 s (about 1 ns per byte) | 4.15 s (about 83 ns per byte) |
| `data(from:)` | 0.02 s | 0.02 s |

For streams of a few hundred kilobytes the difference is invisible. For multi-megabyte streams, a debug build that takes seconds to parse is easy to mistake for a slow server, and a scanner that appends byte by byte into a buffer, like the one above, is where the time goes. Measure parsing performance in a release build, and for large streams consider handling bytes in batches through a data-task delegate, decoding only at the delimiters as described above.

The throughput of a streaming pipeline is the minimum of its stages:

$$
\text{throughput} = \min(\text{network}, \text{parser}, \text{consumer})
$$

The 83 ns per byte of a debug build caps parsing at about 12 MB/s, below a good Wi-Fi link. The 1 ns of a release build, about 1 GB/s, does not limit any network a phone has.

## Summary

- Stream when the first useful value arrives long before the last byte. Use a non-sniffed media type: measured, five NDJSON records were usable from 100 ms as `application/x-ndjson` but only after the whole body as `text/plain`.
- Decode UTF-8 only at message boundaries; per-chunk decoding corrupts characters split across chunks.
- `AsyncBytes.lines` accepts `\n`, `\r\n`, and `\r`, and silently drops empty lines. Fine for NDJSON, wrong for Server-Sent Events.
- Parse SSE from bytes: accumulate `data` lines, dispatch on a blank line, track `id` for `Last-Event-ID` resumption and `retry` for backoff.
- A small scanner that tracks depth and strings can hand out the elements of a large JSON array as they complete.
- A paused consumer grew the footprint by only about 5 MB with 100 MB pending; breaking out of the loop does not end the transfer until `AsyncBytes` is released, so cancel `bytes.task`.
- Per-byte iteration costs about 1 ns optimized and 83 ns in debug builds; measure parsers in release builds.

## Exercise

Write an `AsyncSequence` adapter, `ServerSentEvents<Base: AsyncSequence> where Base.Element == UInt8`, that wraps `SSEParser`, and a `reconnecting` function that reconnects with the server-provided `retry` delay and the last `id` when the stream ends or fails. Test it against a server that closes the stream after three events each time. Assert that ten events arrive in order with no duplicates across four connections, and that the delay between connections matches a `retry: 200` sent in the stream.

## Further reading

- The HTML Standard's [Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html) section, including the parsing algorithm the parser follows.
- [NDJSON](https://github.com/ndjson/ndjson-spec) and [RFC 7464: JSON Text Sequences](https://www.rfc-editor.org/rfc/rfc7464), two conventions for streaming JSON values.
- Apple's [`URLSession.AsyncBytes`](https://developer.apple.com/documentation/foundation/urlsession/asyncbytes) documentation.

Previous: [WebSockets: Connection State and Reconnection](/swift-websockets-reconnection/). Next: [Isolating HTTP Fixtures with `URLProtocol`](/swift-urlprotocol-fixtures/).

Return to the [Networking roadmap](/swift-networking/).
