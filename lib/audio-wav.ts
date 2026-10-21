const TARGET_SAMPLE_RATE = 16_000;

export function encodeMonoPcmWav(
  samples: Float32Array,
  sampleRate = TARGET_SAMPLE_RATE,
): Blob {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeText = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(44 + index * 2, pcm, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function resampleToMono(
  channels: readonly Float32Array[],
  sourceSampleRate: number,
  targetSampleRate = TARGET_SAMPLE_RATE,
): Float32Array {
  if (channels.length === 0 || sourceSampleRate <= 0 || targetSampleRate <= 0) {
    throw new Error("Audio channels and sample rates are required.");
  }

  const sourceLength = Math.min(...channels.map((channel) => channel.length));
  const outputLength = Math.ceil(
    (sourceLength * targetSampleRate) / sourceSampleRate,
  );
  const mono = new Float32Array(outputLength);
  const channelScale = 1 / channels.length;

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition = (outputIndex * sourceSampleRate) / targetSampleRate;
    const lowerIndex = Math.min(Math.floor(sourcePosition), sourceLength - 1);
    const upperIndex = Math.min(lowerIndex + 1, sourceLength - 1);
    const fraction = sourcePosition - lowerIndex;
    let sample = 0;
    for (const channel of channels) {
      const interpolated =
        channel[lowerIndex] * (1 - fraction) + channel[upperIndex] * fraction;
      sample += interpolated * channelScale;
    }
    mono[outputIndex] = sample;
  }
  return mono;
}

export async function recordingToWav(recording: Blob): Promise<Blob> {
  const AudioContextConstructor =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("Audio decoding is not supported in this browser.");
  }

  const context = new AudioContextConstructor();
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
      decoded.getChannelData(index),
    );
    return encodeMonoPcmWav(
      resampleToMono(channels, decoded.sampleRate),
      TARGET_SAMPLE_RATE,
    );
  } finally {
    await context.close();
  }
}
