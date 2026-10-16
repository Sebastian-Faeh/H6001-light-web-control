# H6001-light-web-control

Unofficial, single-file Web Bluetooth page for the Govee H6001 LED bulb.
It switches the bulb, sets brightness and colour, and writes the bulb's
built-in daily timer (sunrise or sunset scene), so the bulb runs it on its
own. No Govee app or account is needed.

**Open the page:** <https://sebastian-faeh.github.io/H6001-light-web-control/>
(served by GitHub Pages). The link to `index.html` on github.com only shows the
source code and does not run it.

**Status:** experimental, tested on one bulb (firmware 2.01.05) with Chrome on
Android. Only Google Chrome (Android or desktop) supports Web Bluetooth.

**Use:** open the page in Chrome, connect to the bulb (close the Govee app
first), set start, duration and scene, press Save. The page reads the timer back
and reports whether the bulb accepted it. After saving, the bulb runs the
timer on its own and the page does not need to stay connected.

## Features

- **Light:** on/off, brightness, hue and saturation. After "On" the sliders are
  set from the state the bulb reports (in a scene only the brightness follows).
- **Timer:** one daily window: start, duration (15 minutes to 3 h in 15 minute
  steps), enabled, scene *Sunrise*, *Sunset* or *On* (plain colour with the slider
  values, assumed to work, see [PROTOCOL.md](PROTOCOL.md)). Read-back check after
  saving.
- **Sunset now:** selects the sunset scene and switches on; the page checks the
  bulb's reply.
- **Sunset from a link:** open the page with `?action=sunset`, for example
  <https://sebastian-faeh.github.io/H6001-light-web-control/?action=sunset>; the
  sunset starts as soon as the page is connected. In Chrome on Android, menu
  (three dots), "Add to Home screen" turns it into a one-tap shortcut.
- **Alarm:** wake time, duration, scene and weekdays. The bulb timer repeats
  every day and has no weekday, so the page enables it for the next start if that
  weekday is selected and disables it otherwise. It checks at every connection
  and once a day after 02:00 while the page is open. Settings are stored in a
  cookie (and, for local files, in localStorage). Details and limits are in the
  comment block of [`index.html`](index.html).
- **One active page:** a newly opened page of the site makes older ones let go of
  the bulb (they disconnect and say so). A page cannot close another tab.

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

## Automatic reconnection (Chrome on Android)

On load the page connects to the bulb that was chosen earlier. This needs
`navigator.bluetooth.getDevices()`, which Chrome has offered behind a flag in
some versions (see [implementation status](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md),
which may be outdated).

1. Open the page once and choose the bulb with **Search**. The permission is
   stored per address, so it has to be repeated for a new address (for
   example GitHub Pages instead of a local file).
2. Close the Govee app (a connected app stops the bulb from advertising).
   The bulb needs power; the light may be off.
3. Reload the page. The log must show `getDevices() available.`
4. If it shows `getDevices() not available`: open `chrome://flags`, set
   `#enable-experimental-web-platform-features` and
   `#enable-web-bluetooth-new-permissions-backend` to **Enabled** (both were
   set in the verified setup), and relaunch Chrome.
5. If the log shows `Auto-connection failed`: the page first waits up to 10 s
   for an advertisement of the bulb (`watchAdvertisements()`), because
   Chrome refuses to connect to a stored device it has not seen advertising
   ("Bluetooth Device is no longer in range"). Check the log line after
   `Auto-connecting`:

| Log line | Meaning |
|---|---|
| `Bulb advertisement received.` | works; the connection follows |
| `No advertisement from the bulb within 10 s.` | Chrome does not see the bulb: check that the bulb is powered, nothing else is connected, Chrome has the Android permission "Nearby devices", and location is on (needed for BLE scans on some Android versions; not confirmed for every device) |
| `watchAdvertisements(): ...` | the function is blocked or missing: set the flag from step 4 |
| `watchAdvertisements() not available, connecting directly.` | the page tries a plain connect, which may fail |

If nothing helps, **Search** selects the bulb again; a fresh scan always
finds it.

**Verified:** once, on a Galaxy Tab Active5 (Android 16) with Chrome Stable
and the GitHub Pages address, with both flags from step 4 set to Enabled
(`#enable-experimental-web-platform-features` and
`#enable-web-bluetooth-new-permissions-backend`): `getDevices() available.`,
`Bulb advertisement received.`, connected within 1 s. Before the
`watchAdvertisements()` step the same setup failed with "Bluetooth Device is no
longer in range." Not recorded, and therefore unknown: the Chrome version, and
whether each flag is needed on its own or whether Chrome Stable works without
them.

## Known limits

- The alarm works only while the page is open and the device is awake. Wake times
  before 02:00 are not supported. Disabling the timer on unselected weekdays,
  scene *On*, windows below 38 minutes and the length of the sunset scene are
  untested on the bulb. A manual Save is overwritten by the alarm at the next
  check while it is active.
- Only one daily timer window is used (timer id 1). Writes to id 0 were
  silently discarded by the bulb in tests; the cause is unknown.
- The scene (sunrise or sunset) applies to the bulb as a whole, not per timer.
- The behaviour at the end of the timer window has not been observed.
- The bulb clock is set at every connection; after the daylight-saving change
  open the page once. Winter time is untested.
- Automatic reconnection works only while the bulb advertises, i.e. while no
  other app is connected to it (see the section above).
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
