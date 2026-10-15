# H6001-light-web-control

Unofficial, single-file Web Bluetooth page for the Govee H6001 LED bulb.
It switches the bulb, sets brightness and colour, and writes the bulb's
built-in daily timer (sunrise or sunset scene), so the bulb runs it on its
own. No Govee app or account is needed.

**Status:** experimental, tested on one bulb (firmware 2.01.05) with Chrome on
Android. Only Google Chrome (Android or desktop) supports Web Bluetooth.

**Use:** open the page in Chrome, connect to the bulb (close the Govee app
first), set start, end and scene, press Save. The page reads the timer back
and reports whether the bulb accepted it.

The protocol notes, open questions and acknowledgements are in the comment
block at the top of the script in the HTML file.

## Disclaimer

Unofficial project. It is not affiliated with, endorsed by or supported by
Govee. "Govee" is a trademark of its owner and is used here only to name the
product this page is compatible with. Use at your own risk.

## License

[PolyForm Noncommercial License 1.0.0](LICENSE): free to use, copy and modify
for noncommercial purposes. Commercial use requires separate permission from
the copyright holder.

Required Notice: Copyright 2026 Sebastian-Faeh (https://github.com/Sebastian-Faeh)
