import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';

/**
 * Spoken turn cues. On iOS the default audio session is silenced by the ring/
 * silent switch, so on first use we ask for playback that ignores it and mixes
 * with whatever else is playing (a podcast keeps going under the voice).
 * Everything here is best-effort: a failure means no voice, never a crash.
 */

let prepared: Promise<void> | null = null;
let voice: string | undefined;

export function prepareVoice(): Promise<void> {
  prepared ??= (async () => {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
      });
    } catch {
      // fall back to the default session
    }
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const british = voices.filter((v) => v.language?.toLowerCase().replace('_', '-').startsWith('en-gb'));
      voice = (british.find((v) => v.quality === Speech.VoiceQuality.Enhanced) ?? british[0])?.identifier;
    } catch {
      // the system default voice is fine
    }
  })();
  return prepared;
}

/** Say something. `interrupt` cuts off whatever is being said (for "turn now" cues). */
export function speak(text: string, interrupt = false): void {
  void prepareVoice().then(() => {
    if (interrupt) void Speech.stop();
    Speech.speak(text, { language: 'en-GB', voice, rate: 0.95 });
  });
}

export function stopSpeaking(): void {
  void Speech.stop().catch(() => {});
}
