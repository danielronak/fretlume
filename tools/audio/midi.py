"""A minimal Standard MIDI File (format 0) writer: tempo, programs, pitch bend, notes."""
from __future__ import annotations

import struct

TICKS_PER_BEAT = 960
TEMPO_US = 500_000  # 120 BPM: 1 beat = 0.5 s, so 1920 ticks per second


def _varlen(value: int) -> bytes:
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(out))


def ticks(seconds: float) -> int:
    return round(seconds * TICKS_PER_BEAT * 1_000_000 / TEMPO_US)


class Midi:
    def __init__(self) -> None:
        self.events: list[tuple[int, int, bytes]] = []  # (tick, order, data)

    def add(self, seconds: float, data: bytes, order: int = 1) -> None:
        self.events.append((ticks(seconds), order, data))

    def program(self, channel: int, program: int) -> None:
        self.add(0.0, bytes([0xC0 | channel, program]), order=0)

    def bend_cents(self, seconds: float, channel: int, cents: float) -> None:
        # Default bend range is ±2 semitones = ±200 cents over ±8192.
        value = max(0, min(16383, round(8192 + cents / 200 * 8192)))
        self.add(seconds, bytes([0xE0 | channel, value & 0x7F, value >> 7]), order=0)

    def note(self, start: float, dur: float, channel: int, midi: int, velocity: int) -> None:
        self.add(start, bytes([0x90 | channel, midi, velocity]), order=2)
        self.add(start + dur, bytes([0x80 | channel, midi, 0]), order=1)

    def to_bytes(self) -> bytes:
        track = bytearray()
        track += b"\x00\xff\x51\x03" + TEMPO_US.to_bytes(3, "big")
        last = 0
        for tick, _, data in sorted(self.events, key=lambda e: (e[0], e[1])):
            track += _varlen(tick - last) + data
            last = tick
        track += b"\x00\xff\x2f\x00"
        header = b"MThd" + struct.pack(">IHHH", 6, 0, 1, TICKS_PER_BEAT)
        return header + b"MTrk" + struct.pack(">I", len(track)) + bytes(track)
