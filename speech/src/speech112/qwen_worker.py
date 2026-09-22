"""CUDA-only Qwen worker; stdout is reserved for binary IPC, logs use stderr."""

from __future__ import annotations

import json
import logging
import queue
import sys
import threading
from contextlib import closing

from speech112.qwen_protocol import SAMPLE_RATE, frame


def main() -> None:
    output = sys.stdout.buffer
    sys.stdout = sys.stderr
    logging.basicConfig(level=logging.INFO)
    cancelled = threading.Event()
    commands: queue.Queue[dict | None] = queue.Queue(maxsize=1)
    state_lock = threading.Lock()
    cancelled_ids: set[int] = set()
    active_id: int | None = None
    completed_id = 0

    def receive() -> None:
        try:
            for line in sys.stdin:
                command = json.loads(line)
                if "cancel" in command:
                    with state_lock:
                        request_id = command["cancel"]
                        if request_id > completed_id:
                            cancelled_ids.add(request_id)
                        if request_id == active_id:
                            cancelled.set()
                else:
                    commands.put(command)
        finally:
            cancelled.set()
            commands.put(None)

    def send(kind: bytes, payload: bytes = b"") -> None:
        output.write(frame(kind, payload))
        output.flush()

    try:
        import numpy as np
        import soundfile as sf
        import torch
        from faster_qwen3_tts import FasterQwen3TTS

        init = json.loads(sys.stdin.readline())
        config = init["config"]
        if not config["device"].startswith("cuda") or not torch.cuda.is_available():
            raise ValueError("Qwen Voice Clone требует CUDA")
        torch.set_num_threads(4)
        model = FasterQwen3TTS.from_pretrained(
            config["model_dir"],
            device=config["device"],
            dtype=torch.bfloat16,
            attn_implementation="sdpa",
            max_seq_len=config["max_sequence_length"],
            backend="torch",
            local_files_only=True,
        )
        prompts = {}
        for voice in init["voices"]:
            if not voice["reference_text"].strip():
                raise ValueError(f"Нет расшифровки эталона: {voice['id']}")
            audio, rate = sf.read(voice["reference_audio"], dtype="float32", always_2d=True)
            start, end = voice["reference_start_seconds"], voice["reference_end_seconds"]
            if not 0 <= start < end <= len(audio) / rate or not 1 <= end - start <= 30:
                raise ValueError(f"Неверные границы эталона: {voice['id']}")
            audio = audio[int(start * rate) : int(end * rate)].mean(axis=1)
            prompts[voice["id"]] = model.model.create_voice_clone_prompt(
                ref_audio=(audio, rate),
                ref_text=voice["reference_text"],
                x_vector_only_mode=False,
            )
            logging.info(
                "Подготовлен голос %s: %s, %.2f–%.2f с",
                voice["id"],
                voice["reference_audio"],
                start,
                end,
            )

        def generate(text: str, voice_id: str):
            return model.generate_voice_clone_streaming(
                text=text,
                language="Russian",
                voice_clone_prompt=prompts[voice_id],
                chunk_size=config["chunk_size"],
                xvec_only=False,
                non_streaming_mode=True,
            )

        # Capture CUDA graphs once; do not alter model precision or sampling defaults.
        with closing(generate("Алло, вы меня слышите?", init["voices"][0]["id"])) as stream:
            for _ in stream:
                pass
        torch.cuda.empty_cache()
        logging.info(
            "Qwen CUDA allocated %.0f MiB, reserved %.0f MiB",
            torch.cuda.memory_allocated() / 2**20,
            torch.cuda.memory_reserved() / 2**20,
        )
        threading.Thread(target=receive, name="qwen-commands", daemon=True).start()
        send(b"R")
    except Exception as error:
        logging.exception("Не удалось запустить Qwen")
        send(b"E", str(error).encode())
        return

    while (request := commands.get()) is not None:
        with state_lock:
            active_id = request["id"]
            cancelled.clear()
            if active_id in cancelled_ids:
                cancelled.set()
        try:
            if cancelled.is_set():
                continue
            with closing(generate(request["text"], request["voice"])) as stream:
                for samples, rate, _ in stream:
                    if cancelled.is_set():
                        break
                    samples = np.asarray(samples, dtype="<f4").reshape(-1)
                    if samples.size:
                        send(b"A", SAMPLE_RATE.pack(rate) + samples.tobytes())
        except Exception as error:
            logging.exception("Ошибка синтеза Qwen")
            send(b"E", str(error).encode())
        finally:
            with state_lock:
                completed_id = request["id"]
                cancelled_ids.discard(completed_id)
                active_id = None
            send(b"D")


if __name__ == "__main__":
    main()
