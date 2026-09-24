"""One real CPU call through the production ZeroMQ runtime; no browser or business API."""

import argparse
import asyncio
import json
import resource
import subprocess
import sys
import time
import uuid
from pathlib import Path

import numpy as np
import soundfile as sf
import zmq
import zmq.asyncio
from benchmark_call import QUESTIONS
from scipy.signal import resample_poly

from speech112.config import AppConfig
from speech112.runtime.bundle import ScenarioBundle
from speech112.runtime.factory import open_models
from speech112.service import SpeechService
from speech112.telephone_noise import PhoneRecordings


async def run(output):
    output.mkdir(parents=True, exist_ok=True)
    config = AppConfig.load(Path("config/default.toml"))
    bundle = ScenarioBundle.parse(Path("src/speech112/contracts/demo-scenario.json").read_bytes())
    recordings = PhoneRecordings.load(Path(config.telephone.directory), 24000)
    subprocess.run([sys.executable, "tools/prepare_benchmark.py"], check=True)
    async with open_models(config) as models:
        voice = models[4]["demo"]
        for text in bundle.utterances():
            await voice.prepare(text)
        fixtures = [
            resample_poly(voice._render(text), 2, 3).astype(np.float32) for text in QUESTIONS
        ]
        context = zmq.asyncio.Context()
        server = context.socket(zmq.ROUTER)
        client = context.socket(zmq.DEALER)
        server.setsockopt(zmq.LINGER, 0)
        client.setsockopt(zmq.LINGER, 0)
        server.bind("inproc://one-call")
        client.connect("inproc://one-call")
        service = SpeechService(server, config, models, recordings)
        serving = asyncio.create_task(service.receive())
        events = []
        incoming = asyncio.Queue()
        audio = []

        async def command(value):
            await client.send_multipart([b"command", json.dumps(value).encode()])

        async def receive():
            while True:
                kind, payload = await client.recv_multipart()
                if kind == b"event":
                    value = json.loads(payload)
                    events.append(dict(at_seconds=time.perf_counter() - start, **value))
                    await incoming.put(value)
                else:
                    header = np.frombuffer(payload[:12], dtype="<u4")
                    audio.append(np.frombuffer(payload[12:], dtype="<f4").copy())
                    # Real-time runtime already paces 32 ms packets. Acknowledge after
                    # simulated device playback, not immediately on network receipt.
                    await asyncio.sleep(0.032)
                    await command(dict(type="played", generation=int(header[0]), id=int(header[1])))

        async def wait(kind):
            async with asyncio.timeout(20):
                while True:
                    value = await incoming.get()
                    if value["type"] in ("unavailable", "busy"):
                        raise RuntimeError(value)
                    if value["type"] == kind:
                        return value

        async def heartbeat():
            while True:
                await asyncio.sleep(3)
                await command(dict(type="ping"))

        start = time.perf_counter()
        cpu = time.process_time()
        receiver = asyncio.create_task(receive())
        beating = asyncio.create_task(heartbeat())
        try:
            await command(
                dict(
                    type="start",
                    version=2,
                    attempt_id=str(uuid.uuid4()),
                    artifact=bundle.payload.decode(),
                    sha256=bundle.digest,
                )
            )
            await wait("ready")
            await wait("turn_completed")
            for index, fixture in enumerate(fixtures):
                signal = np.concatenate((fixture, np.zeros(16000, dtype=np.float32)))
                began = time.perf_counter()
                for offset in range(0, len(signal), 512):
                    frame = signal[offset : offset + 512]
                    frame = np.pad(frame, (0, 512 - len(frame)))
                    await client.send_multipart(
                        [b"audio", (np.clip(frame, -1, 1) * 32767).astype("<i2").tobytes()]
                    )
                    await asyncio.sleep(
                        max(0, began + (offset + 512) / 16000 - time.perf_counter())
                    )
                turn = await wait("turn_completed")
                print(index, turn, flush=True)
                if index == 0:
                    await command(dict(type="suspend"))
                    await wait("suspended")
                    await asyncio.sleep(0.25)
                    await command(dict(type="resume"))
                    resumed = await wait("resumed")
                    assert resumed["state"] == turn["state"], (resumed, turn)
            await wait("ended")
            report = dict(
                elapsed_seconds=time.perf_counter() - start,
                cpu_seconds=time.process_time() - cpu,
                rss_max_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
                * (1 if sys.platform == "darwin" else 1024),
                scope=(
                    "One in-process ZeroMQ call, real CPU models, simulated playback "
                    "acknowledgements. No browser/network certification."
                ),
                events=events,
            )
            report["mean_cpu_cores"] = report["cpu_seconds"] / report["elapsed_seconds"]
            (output / "wire-call.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
            sf.write(output / "runtime-caller.wav", np.concatenate(audio), 24000)
        finally:
            for task in (serving, receiver, beating):
                task.cancel()
            await asyncio.gather(serving, receiver, beating, return_exceptions=True)
            server.close()
            client.close()
            context.term()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    asyncio.run(run(parser.parse_args().output))
