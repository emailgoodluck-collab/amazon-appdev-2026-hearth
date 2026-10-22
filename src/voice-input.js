export function createSpeechRecognition(callbacks, Recognition = getRecognitionConstructor()) {
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = callbacks.onStart;
  recognition.onerror = (event) => callbacks.onError(event.error);
  recognition.onend = callbacks.onEnd;
  recognition.onresult = (event) => {
    let finalTranscript = "";
    let interimTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) finalTranscript += result[0].transcript;
      else interimTranscript += result[0].transcript;
    }

    const transcript = finalTranscript || interimTranscript;
    if (transcript) {
      callbacks.onTranscript({
        transcript: transcript.trim(),
        isFinal: Boolean(finalTranscript),
      });
    }
  };
  return recognition;
}

export function getRecognitionConstructor(scope = globalThis) {
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}
