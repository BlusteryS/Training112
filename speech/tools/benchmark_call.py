"""Real local CPU model benchmark, paced microphone input, actual VAD/ASR/NLU/cache.

Synthetic operator audio is a reproducible integration fixture, not a human speech quality test.
"""

import argparse
import asyncio
import json
import platform
import resource
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from speech112.audio import VadAudioChannel
from speech112.config import AppConfig
from speech112.events import EventKind
from speech112.runtime.bundle import ScenarioBundle
from speech112.runtime.dialogue import ScenarioDialogue
from speech112.runtime.factory import open_models
from speech112.runtime.models import OnnxVad

QUESTIONS = [
    "Здравствуйте, расскажите, что произошло.",
    "На какую улицу отправлять пожарную машину?",
    "Как к вам можно обращаться?",
    "Есть ли люди, которым нужна скорая?",
    "Пожарные выехали к вам. Дождитесь их.",
    "Спасибо, до свидания.",
]


async def run(output):
    output.mkdir(parents=True, exist_ok=True)
    config = AppConfig.load(Path("config/default.toml"))
    bundle = ScenarioBundle.parse(Path("src/speech112/contracts/demo-scenario.json").read_bytes())
    subprocess.run([sys.executable, "tools/prepare_benchmark.py"], check=True)
    began = time.perf_counter()
    async with open_models(config) as (_, vad, asr, intent, voices):
        load_seconds = time.perf_counter() - began
        voice = voices["demo"]
        # Preparation happens before the measured call, including operator test fixtures.
        for text in bundle.utterances():
            await voice.prepare(text)
        utterances = [voice._render(text) for text in QUESTIONS]
        dialogue = ScenarioDialogue(bundle, intent, 7)
        rows, recording = [], []
        for question, input_audio in zip(QUESTIONS, utterances, strict=True):
            channel = VadAudioChannel(16000, 32, config.vad, OnnxVad(vad), asr.stream())
            task = asyncio.create_task(channel.detect_speech())
            audio = resample_poly(input_audio, 2, 3).astype(np.float32)
            audio = np.concatenate(
                (np.zeros(1600, dtype=np.float32), audio, np.zeros(16000, dtype=np.float32))
            )
            start = time.perf_counter()
            cpu = time.process_time()

            async def feed(audio=audio, channel=channel, start=start):
                for offset in range(0, len(audio), 512):
                    frame = audio[offset : offset + 512]
                    channel._enqueue_frame(np.pad(frame, (0, 512 - len(frame))))
                    await asyncio.sleep(
                        max(0, start + (offset + 512) / 16000 - time.perf_counter())
                    )

            feeder = asyncio.create_task(feed())
            try:
                async with asyncio.timeout(len(audio) / 16000 + 5):
                    while True:
                        event = await channel.events.get()
                        if event.kind == EventKind.SPEECH_ENDED:
                            break
                recognized_at = time.perf_counter()
                reply = await dialogue.respond(event.text)
                first_audio = None
                chunks = []
                for fragment in reply.fragments or (reply.text,):
                    async for chunk in voice.stream(fragment):
                        if first_audio is None:
                            first_audio = time.perf_counter()
                        chunks.append(chunk.samples)
                dialogue.commit(reply)
                row = dict(
                    operator=question,
                    recognized=event.text,
                    reply=reply.text,
                    response_id=reply.response_id,
                    input_seconds=len(audio) / 16000,
                    elapsed_seconds=time.perf_counter() - start,
                    end_to_audio_available_ms=(first_audio - event.ended_at) * 1000,
                    cpu_seconds=time.process_time() - cpu,
                    nlu_and_cache_ms=(first_audio - recognized_at) * 1000,
                    clarification=reply.response_id == "clarification",
                )
                # Endpoint-to-available audio excludes network, browser and hardware playback.
                rows.append(row)
                recording.extend(
                    [input_audio, np.zeros(12000), np.concatenate(chunks), np.zeros(18000)]
                )
                print(json.dumps(row, ensure_ascii=False), flush=True)
            finally:
                task.cancel()
                feeder.cancel()
                await asyncio.gather(task, feeder, return_exceptions=True)
        report = dict(
            hardware=platform.platform(),
            processor=platform.machine(),
            load_seconds=load_seconds,
            rss_max_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            * (1 if sys.platform == "darwin" else 1024),
            disclaimer=(
                "One local synthetic call. No browser/network playback, "
                "human speech or 20-call certification."
            ),
            turns=rows,
        )
        (output / "call-metrics.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
        (output / "answers.txt").write_text(
            "\n\n".join(
                f"Оператор: {r['operator']}\nASR: {r['recognized']}\nЗаявитель: {r['reply']}"
                for r in rows
            )
        )
        sf.write(output / "call-example.wav", np.concatenate(recording), 24000)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    asyncio.run(run(parser.parse_args().output))
