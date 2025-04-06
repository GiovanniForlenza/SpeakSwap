import { useEffect, useRef, useState } from "react";

export default function VoiceRecorder() {
  const mediaRecorderRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);

  const audioChunks = useRef([]);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: "audio/webm",
    });

    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      audioChunks.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks.current, { type: "audio/webm" });
      audioChunks.current = [];
      const url = URL.createObjectURL(blob);
      setAudioURL(url);

      // TODO: Invia blob al server
    };

    mediaRecorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="p-4 space-y-4">
      {!recording ? (
        <button onClick={startRecording}>🎙️ Inizia a parlare</button>
      ) : (
        <button onClick={stopRecording}>🛑 Ferma</button>
      )}

      {audioURL && (
        <audio controls src={audioURL} className="mt-4" />
      )}
    </div>
  );
}