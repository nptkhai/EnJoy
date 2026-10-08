// Text-to-speech wrapper around the Web Speech API (speechSynthesis).
// Works offline with the voices installed in Windows/Chrome; degrades gracefully when absent.

const LANG = 'en-US';

/**
 * @param {{ getRate?: () => number }} [options]
 */
export function createAudio({ getRate = () => 1 } = {}) {
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  const supported = Boolean(synth && typeof window.SpeechSynthesisUtterance === 'function');
  let voice = null;

  function pickVoice() {
    if (!supported) return;
    const voices = synth.getVoices();
    voice =
      voices.find((v) => v.lang === LANG && v.localService) ||
      voices.find((v) => v.lang === LANG) ||
      voices.find((v) => v.lang?.startsWith('en')) ||
      null;
  }

  if (supported) {
    pickVoice();
    synth.addEventListener?.('voiceschanged', pickVoice);
  }

  return {
    isSupported: supported,
    /** Speak English text. Returns false if speech is not available. */
    speak(text, { rate } = {}) {
      if (!supported || !text) return false;
      try {
        synth.cancel(); // don't queue up repeated clicks
        const u = new SpeechSynthesisUtterance(text);
        u.lang = LANG;
        if (voice) u.voice = voice;
        u.rate = rate ?? getRate();
        synth.speak(u);
        return true;
      } catch (err) {
        console.warn('Không phát được âm thanh:', err);
        return false;
      }
    },
    cancel() {
      try {
        synth?.cancel();
      } catch {
        /* ignore */
      }
    },
  };
}
