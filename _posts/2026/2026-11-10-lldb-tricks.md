---
layout: post
title: "LLDB Survival Guide: Theory, Tricks, and Python Hooks"
date: "2026-04-04"
last_modified_at: "2026-04-04"
permalink: /lldb-survival-guide/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/lldb_full.webp"
categories:
  - "Development"
  - "Debugging"
  - "Programming"
  - "Swift"
tags:
  - "LLDB"
  - "Debugging"
  - "Swift"
  - "macOS"
published: true
---

LLDB is more than a place to set breakpoints. You can inspect app state, test quick fixes without rebuilding, and automate common debug steps. This guide keeps things practical and beginner-friendly.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/lldb_full.webp"
 alt_text="LLDB console close up"
 caption="LLDB in its natural habitat"
 width="960"
 height="1568"
%}

## Start Here: What LLDB Is and How to Run It

`LLDB` (sometimes typed as `lldb` in lowercase by mistake) is the debugger that ships with Xcode command line tools.

If your app is not running yet, launch it under LLDB:

```bash
xcrun lldb /path/to/MyApp
```

Then in the LLDB prompt:

```bash
(lldb) run
```

If your app is already running, attach to it:

```bash
pgrep -x MyApp
xcrun lldb -p <pid>
```

Or from inside LLDB:

```bash
(lldb) attach --name MyApp
```

To exit:

```bash
(lldb) quit
```

## Why Attaching To Production Apps Can Fail

Many people hit this early: attaching to production macOS apps is often blocked by security rules.

Main reasons:

- SIP (System Integrity Protection) blocks debugging many protected/system processes.
- Hardened Runtime + missing `get-task-allow` entitlement can block debugger attach.
- App Store/release builds are usually signed to prevent casual attaching.

So yes, sometimes attach starts working only after SIP is disabled on a test machine. But SIP is not the only gate. Even with SIP disabled, code-signing and entitlements can still block attach.

Check SIP status:

```bash
csrutil status
```

If you are doing local security research on your own Mac only, disable SIP temporarily:

1. Reboot into Recovery.
2. Open Terminal in Recovery.
3. Run `csrutil disable`.
4. Reboot normally.

Warning: this is dangerous. Disabling SIP removes important macOS protections that block system tampering and many privilege-escalation paths. If malware runs while SIP is off, it has a much easier time persisting and modifying protected files/processes. Do this only on an isolated test machine, never on your daily-use Mac, and re-enable SIP immediately after testing.

Re-enable it when done:

1. Reboot into Recovery again.
2. Run `csrutil enable`.
3. Reboot normally.

## A Fast Theory Primer

LLDB has two parts:

- The command line you type into.
- An internal toolkit called the `SB API` (`SB` = **Script Bridge** in LLDB docs).

Note: this is LLDB's API naming and is different from the separate macOS `ScriptingBridge` framework.

What is the `SB API object model`?

It is just LLDB's internal set of objects (like building blocks): app, process, thread, stack frame, variables, and symbols. LLDB commands use these objects behind the scenes.

Typical flow:

- Create or select the app to debug (called a "target"): `target create ...`
- Launch or attach: `run` / `attach ...`
- Check liveness: `process status`
- Inspect call stack and local values: `frame info`, `frame variable -L` (or alias `v -L`)

`expr -- <code>` runs code inside the paused app. Start with read-only checks. Only change values on purpose.

## Quick Commands I Actually Use

```
(lldb) breakpoint set --name viewDidLoad
(lldb) thread step-in
(lldb) thread backtrace
(lldb) frame variable request
(lldb) expr -l objc -O -- [[[UIApplication sharedApplication] connectedScenes] allObjects]
(lldb) memory read --format x --size 8 --count 8 $sp
```

Speed tips: `br s -n`, `bt`, `v` (or `frame var`), and `mem r` are short versions of common commands. Use `--one-shot true` for temporary breakpoints so they remove themselves after one hit.

## Anatomy of a Stop

LLDB can stop because of a breakpoint, crash signal, exception, or watchpoint. First step: find out why it stopped.

Common crash signals/exceptions you will see:

- `EXC_BAD_ACCESS` / `SIGSEGV`: invalid memory access (use-after-free, null/garbage pointer).
- `SIGABRT`: app called `abort()` (failed assertion, fatal error, uncaught runtime issue).
- `SIGILL`: illegal CPU instruction (corrupted state, bad jump, unsupported instruction path).

`process status` tells you if you hit `EXC_BAD_ACCESS`, `SIGSEGV`, or a normal breakpoint. `thread backtrace all` shows what every thread is doing, which helps with hangs. `thread return` can skip the current function, but use it carefully because it changes app behavior.

Breakpoint vs watchpoint (quick difference):

- Breakpoint: stops when execution reaches a code location (file/line/function).
- Watchpoint: stops when a specific value in memory is read/written/modified.

If you get expected signals like `SIGPIPE`, tune handling explicitly:

`process handle SIGPIPE -n true -p true -s false`

## Breakpoints That Pull Their Weight

`br s -f File.swift -l 42` sets a breakpoint at one exact line. `br s -r "viewDidLoad"` matches many functions by name pattern. Conditional breakpoints like `br s -n foo -c 'count > 10'` stop only when a rule is true.

Auto-commands are great for data capture:

- Set breakpoint: `br s -n willDisplayCell`
- Add actions: `br command add <id>`
- Add commands like `thread backtrace`, `frame variable model`, then `continue`

Watchpoints stop when a value changes:

- `watchpoint set variable myVar`
- `watchpoint set variable -w read_write myVar`
- `watchpoint set expression -w modify -- &myVar`

### Tracepoints Without Pausing

When you want logs but do not want to pause:

`br s -n foo -C 'expr -O -- foo' -G true`

Add `--ignore-count` to skip the first N hits.

## Reading Swift Nicely

Swift values can look cleaner with these settings:

- `settings set target.swift-demangle true`
- `settings set target.max-children-count 256`
- `settings set target.process.optimization-warnings true`

Use `expr -l swift -O --` for Swift objects (equivalent to `po` with explicit Swift context) and `expr -l objc -O --` for Objective-C objects. In Release/optimized builds, some local variables may be unavailable; this is normal.

## Production/Optimized Build Survival

`settings set symbols.enable-external-lookup true` can help LLDB find extra symbol info. If local values are optimized away, check raw CPU registers (`register read`) and memory (`memory read`) near `$sp`/`$fp`.

Noise control while stepping:

`settings append target.process.thread.step-avoid-libraries UIKitCore`

`thread jump --by 1` can skip one source line. Use as a last resort.

If tracing is supported in your environment, this sequence is useful:

- `thread trace start`
- `thread trace dump instructions`

## Memory Work: From Sanity Checks to Surgery

Stack sanity check:

`memory read --format x --size 8 --count 4 $fp`

Address-to-symbol mapping:

`image lookup -a 0xADDR`

Controlled mutation during experiments:

- `expr -- myValue = 0`
- `memory write <addr> <bytes>`

For memory allocation history, try `memory history <address>` when available. For memory-region details, use `memory region <address>` and `vmmap` (a macOS terminal tool).

## Async/Await, Actors, and Queues

`thread list` gives a quick view of active threads and queue names. `thread info -s` gives extra stop details.

Useful concurrency breakpoints:

- `br s -n _swift_task_switch`
- `br s -n swift_task_enqueue`

To find where a task was launched, break in the task body and inspect `bt` for concurrency runtime frames around your app frames.

## Crash and Hang Triage Playbook

For hangs:

1. `process interrupt`
2. `thread backtrace all`
3. Check for waits like `pthread_mutex_lock` and `dispatch_semaphore_wait`

For crashes, start with the crashing thread: run `process status`, then `frame info` on that thread. If shared state looks suspicious, add watchpoints and rerun.

To keep a point-in-time artifact for offline analysis:

`process save-core /tmp/foo.core`

## Remote and Core-File Debugging

Remote iOS debugging usually starts with:

- `platform select remote-ios`
- `platform connect connect://<host>:<port>`

Then add symbols locally (`target symbols add ...`) and verify loaded images with `image list`.

For core files:

- `target create --core crash.core`
- `thread backtrace all`
- `thread select <index>` to inspect specific crashed paths

## Symbols and dSYMs

Keep `.dSYM` files available. They help LLDB map memory addresses back to file names and line numbers. Configure search paths in `.lldbinit` (`target.exec-search-paths`, `target.debug-file-search-paths`).

Verification loop:

- `image list -b` for UUID/slide info
- `dwarfdump --uuid` to confirm matches
- fallback symbolication with `atos -o MyApp -arch arm64 -l <slide> <addr>` if needed

## Python: Hooking Your Own Commands

LLDB supports Python. You can add your own custom commands. If you are new, you can skip this section and come back later.

```python
# save as ~/lldb_tools/retain_cycles.py
import lldb

def find_retain_cycles(debugger, command, exe_ctx, result, _):
    """Demo command: run a Swift helper method on an expression."""
    cmd = f"expr -l swift -O -- {command}.debugRetainCycles()"
    res = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(cmd, res)

    if res.Succeeded():
        result.AppendMessage(res.GetOutput() or "")
    else:
        result.SetError(res.GetError() or "Expression failed")

def __lldb_init_module(debugger, _internal_dict):
    debugger.HandleCommand(
        "command script add -f retain_cycles.find_retain_cycles rcfind"
    )
    print("Registered: rcfind <expression>")
```

Wire it in `.lldbinit`:

```
command script import ~/lldb_tools/retain_cycles.py
```

Use it in-session:

```
(lldb) rcfind myController
```

### A More Involved Hook: Auto-Dump on Crash Stops

```python
# ~/lldb_tools/on_crash_dump.py
import datetime
import lldb

CRASH_REASONS = {
    lldb.eStopReasonException,
    lldb.eStopReasonSignal,
}

class CrashDumpHook:
    def __init__(self, target, _extra_args, _internal_dict):
        self.target = target

    def handle_stop(self, exe_ctx, stream):
        thread = exe_ctx.GetThread()
        if not thread.IsValid():
            return False

        reason = thread.GetStopReason()
        if reason not in CRASH_REASONS:
            return False

        ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        path = f"/tmp/lldb-crash-{ts}.txt"

        res = lldb.SBCommandReturnObject()
        interp = self.target.GetDebugger().GetCommandInterpreter()
        interp.HandleCommand("thread backtrace all", res)

        with open(path, "w", encoding="utf-8") as f:
            f.write(f"Stop reason enum: {reason}\n\n")
            f.write(res.GetOutput() or "")

        stream.Printf(f"Wrote crash dump to {path}\n")
        return False

def __lldb_init_module(debugger, _dict):
    debugger.HandleCommand(
        "target stop-hook add -P on_crash_dump.CrashDumpHook"
    )
    print("Registered crash stop hook")
```

Add to `.lldbinit`:

```
command script import ~/lldb_tools/on_crash_dump.py
```

This saves crash dumps only on real crash-like stops, not on every breakpoint.

## Favorite `.lldbinit` Snippets

```
settings set stop-disassembly-count 4
settings set target.process.thread.step-out-avoids-no-debug true
settings set target.process.thread.step-in-avoids-no-debug true
settings set target.max-children-count 256
settings set target.swift-demangle true
command alias bt thread backtrace
command alias frv frame variable -L
command alias memr memory read --format x --size 8 --count 8
```

## Automating Sessions

Small automations that save time:

- Keep recurring breakpoints in a file and load with `command source my_breakpoints.lldb`
- Add quick diagnostics: `target stop-hook add -o "thread backtrace"`
- Turn on protocol logging when needed: `log enable gdb-remote packets`

## Performance Poking Without Instruments

For instruction-level hotspots:

- `thread step-inst`
- `thread until -a <addr>`

For symbol-focused checks:

- `image lookup -n objc_msgSend`
- `br s -a <addr>` with a suitable condition

`statistics dump` helps you see if LLDB itself is slow (for example, symbol loading or heavy expression use).

## UI Debugging Without Xcode

Rendering and layout:

- `br s -n drawRect:`
- `br s -n layoutSubviews`

Responder-chain probing:

`expr -l objc -O -- [UIResponder targetForAction:@selector(description) withSender:nil]`

Text view hierarchy dump (old but still useful in UIKit debugging):

`expr -l objc -O -- [[[UIApplication sharedApplication] keyWindow] recursiveDescription]`

## When LLDB Misbehaves

If LLDB starts slowly or acts weird, first simplify your `.lldbinit`. If module caches are broken, clear `~/Library/Developer/Xcode/DerivedData/ModuleCache*`.

If expressions fail unexpectedly, force the language:

- `expr -l objc -- ...`
- `expr -l swift -- ...`

If remote attach fails repeatedly, restart the target device and clean up stale `debugserver` processes on host and device.

## Tiny Cheat Sheet (copy/paste)

```
br s -n method
br s -f File.swift -l 88
br s -n foo -c 'x > 3'
br s -n foo --one-shot true
watchpoint set variable -w read_write myVar
thread backtrace all
frame variable -L
expr -l swift -O -- myObj.debugDescription()
memory read --format x --size 8 --count 4 $sp
process handle SIGPIPE -n true -p true -s false
```

LLDB gets easier with repetition. Keep a small command list you trust, and add automation later.