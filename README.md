# H6001-light-web-control

Unofficial, single-file Web Bluetooth page for the Govee H6001 LED bulb.
It switches the bulb, sets brightness and colour, and writes the bulb's
built-in daily timer (sunrise or sunset scene), so the bulb runs it on its
own. No Govee app or account is needed.

**Status:** experimental, tested on one bulb (firmware 2.01.05) with Chrome on
Android. Only Google Chrome (Android or desktop) supports Web Bluetooth.

**Use:** open the page in Chrome, connect to the bulb (close the Govee app
first), set start, end and scene, press Save. The page reads the timer back
and reports whether the bulb accepted it. After saving, the bulb runs the
timer on its own and the page does not need to stay connected.

## What is in the repository

| Path | Purpose |
|---|---|
| [`index.html`](index.html) | the page: a single file without dependencies |
| [`PROTOCOL.md`](PROTOCOL.md) | the reverse-engineered Bluetooth protocol, with a status label per item |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | running the tests, trying changes on a bulb, capturing the official app's traffic, adapting to another model |
| [`tools/lab.html`](tools/lab.html) | raw command console for exploring the protocol |
| [`tools/btsnoop_att.py`](tools/btsnoop_att.py) | lists the GATT traffic of an Android Bluetooth HCI snoop log |
| [`tests/`](tests) | tests that run with Node.js and need no dependencies |

## Tests

```
node --test
```

The tests check the packet formats byte for byte against packets captured from
the official app, and the behaviour of the page against a fake browser and a
fake bulb. They do not use Bluetooth and cannot replace a try on a real bulb.
Details are in [DEVELOPMENT.md](DEVELOPMENT.md).

## Known limits

- Only one daily timer window is used (timer id 1). Writes to id 0 were
  silently discarded by the bulb in tests; the cause is unknown.
- The scene (sunrise or sunset) applies to the bulb as a whole, not per timer.
- The behaviour at the end of the timer window has not been observed.
- The bulb clock is set at every connection; after the daylight-saving change
  open the page once. Winter time is untested.
- Open questions are listed in [PROTOCOL.md](PROTOCOL.md).

## Authorship

Developed by Sebastian-Faeh together with Claude (an AI model by Anthropic).
The author supplied the bulb, captured the official app's Bluetooth traffic
on Android, ran all tests on the real bulb and made the design decisions.
Claude analysed the capture, derived the timer and clock commands, and wrote
the page, its documentation, the tools and the test scripts. The code was
written independently; the protocol background is credited in the comment
block of `index.html`.

## Disclaimer

Unofficial project. It is not affiliated with, endorsed by or supported by
Govee. "Govee" is a trademark of its owner and is used here only to name the
product this page is compatible with. Use at your own risk.

## License

[PolyForm Noncommercial License 1.0.0](LICENSE): free to use, copy and modify
for noncommercial purposes. Commercial use requires separate permission from
the copyright holder.

Required Notice: Copyright 2026 Sebastian-Faeh (https://github.com/Sebastian-Faeh)
