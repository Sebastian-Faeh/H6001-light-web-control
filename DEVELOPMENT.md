# Development guide

How to run the tests, try changes on a real bulb, explore the protocol and
adapt the page to another Govee model. The protocol itself is described in
[PROTOCOL.md](PROTOCOL.md).

## Repository layout

| Path | Purpose |
|---|---|
| `index.html` | the page: single file, no build step, no dependencies |
| `tools/lab.html` | raw command console for exploring the protocol |
| `tools/btsnoop_att.py` | lists the ATT (GATT) traffic of a Bluetooth HCI snoop log |
| `tests/` | tests; run with Node.js, no dependencies |
| `PROTOCOL.md` | protocol notes with a status label per item |

## Run the tests

You need Node.js (tested with version 22). In the repository folder:

```
node --test
```

or `npm test`. No `npm install` is needed.

What the tests check:

- `tests/protocol.test.js`: byte-exact checks of the frame checksum, the clock
  packet and the timer packets against packets captured from the official app,
  decoding of timer replies, the colour conversion, the browser check, and that
  the scripts of the HTML files parse.
- `tests/page.test.js`: behaviour of `index.html` against a small fake browser
  and a fake bulb: automatic connection, the fallbacks when no device is known
  or `getDevices()` is missing, warnings for unsupported browsers, and saving a
  timer with read-back, including the case that the bulb silently discards it.

How it works, and what to keep in mind:

- The tests read the code between the markers `// ==PURE-START==` and
  `// ==PURE-END==` in the HTML files. Keep these markers and keep the
  functions between them free of browser objects. The tests fail if the
  markers are moved or renamed.
- The clock packet contains local time. The tests set `TZ=Europe/Berlin`
  themselves so the captured packets (UTC+2) match on any machine.
- The fake bulb mimics what was observed on the real one. It cannot show
  anything the real bulb does differently. If you learn something new about the
  bulb, change the fake bulb and add a test.
- The tests do not use Bluetooth. They do not prove that a change works on a
  real bulb. Try it, see below.

## Try changes on a real bulb

Web Bluetooth needs a secure context. Two simple ways:

- Open `index.html` from local storage in Chrome (`file:///...`). This worked on
  the tested Android tablet.
- Serve the folder locally, for example `python3 -m http.server`, and open
  `http://localhost:8000` on the same computer. `localhost` counts as secure.
  A phone cannot reach the computer's `localhost`; use `chrome://inspect` with
  USB debugging and port forwarding, or host the files over HTTPS.

Close the Govee app first: the bulb accepts one connection at a time. The log
under "Device and log" in the page shows every packet sent and received. On
Android, `chrome://inspect` on a computer shows the page's console.

Testing the automatic reconnection needs a real bulb and the permission stored
for the exact address you open (see "Automatic reconnection" in the README).
The tests only simulate `getDevices()` and `watchAdvertisements()`.

## Explore the protocol

`tools/timer-test.html` runs the open timer experiments (see the open questions in
[PROTOCOL.md](PROTOCOL.md)) as buttons and writes a copyable log. It is served by
GitHub Pages next to the main page.

1. Open `tools/lab.html`, connect and press "Read all". It sends the queries the
   official app sends when it opens.
2. Change **one** setting in the official app (for example only the end time of
   one timer), reconnect with the lab tool, read again, and compare. Changing
   several things at once makes the result impossible to interpret.
3. Test every write by reading back. The bulb acknowledges commands that it
   discards (`33 0a` for timer id 0 is an example).
4. Write down what you learn in `PROTOCOL.md` with an honest status label.

The raw-command field sends any bytes; the tool appends the checksum. Unknown
set commands (`33 ...`) can change settings of the bulb. The official app can
set them back. Unknown queries (`aa ...`) are more likely harmless, but that is
an assumption, not a guarantee.

## Capture the official app's traffic (Android)

This is how the timer and clock commands were found. The menu names differ
between devices; the German names are given in brackets as seen on the tested
Samsung tablet.

1. Enable developer options (tap the build number in the "About" settings seven
   times).
2. In developer options, enable **Bluetooth HCI snoop log**
   (*Bluetooth-HCI-Snoop-Protokoll*), full rather than filtered if you can
   choose.
3. Switch Bluetooth off and on.
4. Open the official app and do the actions you want to study, one at a time.
   Write down the clock times of the actions.
5. In developer options, choose **Take bug report** (*Fehlerbericht erstellen*)
   and share the resulting `.zip` to your computer.
   **Do not switch the snoop log option off before the bug report is finished.**
   On the tested device that deleted the log file, and the first capture was
   lost.
6. The log is inside the zip. On the tested Samsung device (Android 16) it was
   `FS/data/log/bt/btsnoop_hci.log`. Other devices may use another folder; search
   the zip for `btsnoop`.
7. Analyse it with Wireshark (filter `btatt`) or with
   `python3 -I tools/btsnoop_att.py btsnoop_hci.log`, which prints the writes
   and notifications with time, direction, handle and hex value.

The capture and the bug report contain device addresses, installed apps and
other private data. **Do not commit or publish them.** Publish findings as
notes, not as raw logs.

## Adapt the page to another Govee model

The page is written for the H6001. Other models differ in service and
characteristic UUIDs and in some commands, even if the frame format (20 bytes,
XOR checksum) is shared by many models. A reasonable approach:

1. Capture the official app as described above and find the service and
   characteristic UUIDs and handles in the capture.
2. Replace the three UUID constants in `index.html` and `tools/lab.html`.
3. Use the lab tool to check power, brightness and colour first, then the
   timer queries. Do not assume the timer layout is the same.
4. Update the tests with packets from your capture and describe the model in
   `PROTOCOL.md`.

## Publish the page (GitHub Pages)

A link to `index.html` on github.com shows the source code. To run the page it
must be served as a web page:

1. In the repository on GitHub open **Settings**, then **Pages**.
2. Under **Build and deployment** choose **Deploy from a branch**, branch
   `main`, folder `/ (root)`, and save.
3. After a minute or two the page is available at
   `https://<user>.github.io/<repository>/`, here
   <https://sebastian-faeh.github.io/H6001-light-web-control/>.

On a free GitHub account Pages needs a public repository. The address is
HTTPS, which Web Bluetooth needs, and it is stable, so a home-screen shortcut
and Chrome's remembered device permission both work with it.

## Contributing

Keep the page a single file without external libraries. Keep the markers for
the tests. Mark anything you did not verify on a real bulb as *observed* or
*assumed*. Please do not add trademarks or logos of the manufacturer. Contributions
fall under the licence of the repository (see `LICENSE`).
