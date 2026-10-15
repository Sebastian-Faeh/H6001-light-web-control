#!/usr/bin/env python3
"""List the ATT (GATT) traffic of a Bluetooth HCI snoop log (btsnoop_hci.log).

Usage:  python3 -I tools/btsnoop_att.py path/to/btsnoop_hci.log

Prints one line per ATT write/notification: time (UTC), direction (TX = phone to
bulb, RX = bulb to phone), operation, attribute handle and the value as hex.
Wireshark (filter: btatt) shows the same data; this script has no dependencies.

Limitations: only ACL data on the ATT channel is decoded; fragmented L2CAP
packets (not expected at the default ATT MTU of 23) are skipped. The log
contains device addresses and other private data: do not publish it.
"""
import datetime
import struct
import sys

EPOCH_DELTA = 0x00dcddb30f2f8000          # microseconds between year 0 and 1970-01-01
OPS = {0x12: 'WriteReq', 0x52: 'WriteCmd', 0x13: 'WriteRsp', 0x1b: 'Notify',
       0x1d: 'Indic', 0x0a: 'ReadReq', 0x0b: 'ReadRsp'}


def parse(path):
    data = open(path, 'rb').read()
    if data[:8] != b'btsnoop\x00':
        raise SystemExit('not a btsnoop file: ' + repr(data[:8]))
    version, datalink = struct.unpack('>II', data[8:16])
    print('btsnoop version', version, 'datalink', datalink, 'bytes', len(data))
    off, records = 16, []
    while off + 24 <= len(data):
        _orig_len, incl_len, flags, _drops, ts = struct.unpack('>IIIIq', data[off:off + 24])
        off += 24
        payload = data[off:off + incl_len]
        off += incl_len
        when = datetime.datetime.fromtimestamp((ts - EPOCH_DELTA) / 1e6, datetime.timezone.utc)
        records.append((when, flags, payload))
    print('records', len(records))
    events = []
    for when, flags, pkt in records:
        if len(pkt) < 9 or pkt[0] != 2:                    # HCI ACL data only
            continue
        handle_flags, _length = struct.unpack('<HH', pkt[1:5])
        if (handle_flags >> 12) & 3 == 1:                  # continuation fragment
            continue
        l2_len, cid = struct.unpack('<HH', pkt[5:9])
        if cid != 4:                                       # ATT channel only
            continue
        att = pkt[9:9 + l2_len]
        if not att or att[0] not in OPS:
            continue
        op = att[0]
        direction = 'RX' if flags & 1 else 'TX'
        if op in (0x12, 0x52, 0x1b, 0x1d):
            events.append((when, direction, OPS[op], struct.unpack('<H', att[1:3])[0], att[3:]))
        elif op == 0x0b:
            events.append((when, direction, OPS[op], None, att[1:]))
        else:
            events.append((when, direction, OPS[op], None, b''))
    return events


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    events = parse(sys.argv[1])
    print('ATT events', len(events))
    for when, direction, name, handle, value in events:
        if name == 'WriteRsp':
            continue
        shown = '0x%04x' % handle if handle is not None else '      '
        print(when.strftime('%H:%M:%S.%f')[:-3], direction, name, shown, value.hex(' '))


if __name__ == '__main__':
    main()
