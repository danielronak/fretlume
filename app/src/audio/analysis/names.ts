/** Pitch-class names for the listening engine's messages. */
export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** "E4", "F#3" … */
export const midiName = (midi: number) =>
  `${NOTE_NAMES_SHARP[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
