# Bluetooth protocol of the Govee H6001 (reverse engineered)

This is an unofficial description, derived from the bulb's GATT table, a
Bluetooth HCI snoop log of the official app talking to the author's own bulb,
and experiments with the pages in this repository. No app code was decompiled.
The same content, in shorter form, is in the comment block at the top of the
script in `index.html`.

Status labels used below:

- **verified**: seen in the capture and confirmed by the behaviour of the bulb
- **observed**: seen in the capture only
- **assumed**: inferred, not confirmed

Tested on one bulb: firmware `2.01.05`, hardware `1.00.05` (as reported by the
bulb), Bluetooth name `Minger_H6001_xxxx`.

## GATT

| Item | UUID | Properties | Use |
|---|---|---|---|
| Service | `00010203-0405-0607-0809-0a0b0c0d1910` | | the only service this project uses |
| Characteristic `...2b11` | `00010203-0405-0607-0809-0a0b0c0d2b11` | write, write without response | commands to the bulb |
| Characteristic `...2b10` | `00010203-0405-0607-0809-0a0b0c0d2b10` | read, notify | replies from the bulb |

A second service `...1912` with a characteristic `...2b12` exists. Its purpose
is unknown. The official app also writes `01 00` to descriptors of `...2b10`;
this project does not need to.

## Frame format (verified)

Every message, in both directions, is 20 bytes:

| Byte | Content |
|---|---|
| 0 | header: `0x33` set command, `0xAA` query |
| 1 | command |
| 2 to 18 | payload, padded with zeros |
| 19 | XOR of bytes 0 to 18 |

The checksum of all 153 captured packets is valid.

Replies to set commands repeat header and command with an all-zero payload,
for example `33 0a 00 00 ...`. That is only an acknowledgement of receipt. The
bulb sends the same acknowledgement for timer writes that it silently
discards, so **always read back** after writing.

The official app sends the query `aa 01` every 2 seconds as a keep-alive
(reply `aa 01 01` for on, `aa 01 00` for off). The page does the same.

## Commands

| Command | Meaning | Status |
|---|---|---|
| `33 01 01` / `33 01 00` | power on / off | verified |
| `aa 01` | power query, also the app's keep-alive | observed |
| `33 04 vv` | brightness `0x00` to `0xFF` | verified (`0xFF` is clearly brighter than `0x64`, and `aa 04` reads back `ff`) |
| `aa 04` | brightness query, reply `aa 04 vv` | verified |
| `33 05 02 rr gg bb` | static colour (`ff ff ff` gives white) | verified |
| `33 05 04 00` | scene "sunrise"; it starts when the bulb is switched on | verified |
| `33 05 04 01` | scene "sunset" | observed (sent by the app after choosing sunset; not seen running) |
| `aa 05 01` | mode query. Scene mode: reply `aa 05 04 ss` with the scene number. Static colour: reply `aa 05 02 rr gg bb ...`, the colour as sent with `33 05 02`; the bytes after it are unknown | observed (colour reply seen in a log from the page, e.g. `aa 05 02 bf ff ff 00 ff d5 a1`; the page uses it to set the sliders) |
| `33 09 ...` | set the bulb clock (layout below) | verified |
| `33 0a id sh sm eh em en` | write a timer record | verified |
| `aa 0a n` | read timer record `n` (0 or 1) | verified |
| `aa 06`, `aa 07 03` | firmware and hardware version strings | observed |
| `aa 0b` | reply `aa 0b 00 00 0f`, meaning unknown | observed |

The scene command is global: it selects one scene for the bulb, not one per
timer. The official app sends it right after writing the timers.

### Clock packet `33 09`

| Byte | Content |
|---|---|
| 0, 1 | `33 09` |
| 2, 3, 4 | hour, minute, second (local time) |
| 5 | weekday: Monday = 1 to Thursday = 4 observed; the encoding of Sunday (0 or 7) is not known |
| 6 | `01`, meaning assumed (sign or flag of the time zone offset) |
| 7, 8 | time zone offset hours and minutes: `02 00` in summer time (UTC+2); winter time (UTC+1) and negative offsets are assumed, not observed |
| 9, 10 | day, month |
| 11, 12 | year, little endian (`ea 07` = 2026) |
| 13 to 16 | Unix time, little endian, UTC |
| 17, 18 | `00 00` |

The official app sends this at every connection. The bulb has no known command
to read its clock back.

### Timer records `33 0a` and `aa 0a`

Write: `33 0a id sh sm eh em en`. Reply to the query `aa 0a n`:
`aa 0a id sh sm eh em en`.

| Field | Meaning |
|---|---|
| `id` | record id, 0 or 1 |
| `sh sm` | start hour and minute |
| `eh em` | end hour and minute |
| `en` | `01` enabled, `00` off |

Observations:

- The record repeats daily; no weekday field was found.
- At the start time the bulb switches on by itself and plays the selected scene
  (verified once for the sunrise scene with a record written by this project;
  the bulb runs the record on its own).
- What happens at the end time was not observed.
- The reply to `aa 0a n` appears to return the n-th record sorted by start time,
  not the record with id `n`. Take the id from byte 2 of the reply.
- The official app writes both ids one after the other, about 1 second apart,
  and sends the scene afterwards.

### Timer ids: what was accepted

| Write | Window | Result |
|---|---|---|
| id 1 | 21:00 to 21:45 | stored |
| id 1 | 08:00 to 08:51 (start two minutes after the write) | stored, bulb started the sunrise at 08:00 |
| id 0 | 07:40 to 07:45 | silently discarded |
| id 0 | 07:45 to 08:00 | silently discarded |
| id 0 | 07:55 to 08:30 | silently discarded |
| id 0 | 12:00 to 12:30 | silently discarded |

The official app's own writes to id 0 were accepted. Whether the bulb refuses
id 0 itself, windows of 35 minutes or less (the only windows tried on id 0 were
5, 15, 30 and 35 minutes), or something the app does beforehand is **unknown**. The page writes id 1 only and checks by read-back.

## Findings from tools/timer-test.html (17 Oct 2026, one bulb)

- `aa 0a 00` and `aa 0a 01` return two records, both with the id byte `01`. Key them by reply position, not by id.
- A write `33 0a 01 ...` replaced the record at position 1 when the last byte was `01`, and the record at position 0
  when it was `00` (6 of 6 writes, two runs). The mechanism is unknown.
- A write with id `00` and last byte `01` did not store its times; it only changed the id of position 1 to 0.
- A record with last byte `00` **did start** its scene at its start time (07:38, 17 Oct). A start by the other
  record that was still inside its window cannot be excluded for this run; the 06:30 observation the same day agrees.
  So the last byte is not a safe "off" switch, and the weekday alarm cannot skip days with it.
- The bulb drops a connection that is idle for a few seconds unless a keep-alive (`aa 01` every 2 s) is sent.

## Open questions

- Behaviour at the end of the timer window.
- Why writes to id 0 are discarded.
- Meaning of `aa 0b` and of the second service `...1912`.
- Weekday encoding of Sunday, and the clock packet's time zone bytes for winter
  time and negative offsets.
- Whether the sunset scene `33 05 04 01` runs as expected, and for how long. The
  page's "Sunset now" sends `33 05 04 01`, then `33 01 01`, and checks `aa 05 01`.
- Whether a timer with scene "On" lights the bulb in the stored colour. The page
  sends `33 05 02 rr gg bb` and `33 04 vv` so that the stored mode is a plain
  colour (assumed).
- Whether the timer repeats every day (the two records stayed in the bulb after
  they had started once; one-shot behaviour is excluded, daily repetition is not tested).
- What the last byte of a timer write (called "enabled") really means. See the findings below.
- Whether windows shorter than 38 minutes work in timer id 1 (the page offers
  15 minutes and up).
- The lowest useful brightness value, and why the official app showed `0x64` (100)
  right after being used.
