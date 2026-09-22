from collections.abc import AsyncIterator

from speech112.providers import DialogueControl

END_CALL_MARKER = "[[END_CALL]]"


async def decode_reply(tokens: AsyncIterator[str]) -> AsyncIterator[str | DialogueControl]:
    """Separate terminal control from speech, including markers split across tokens.

    Only commit END_CALL after a complete, successfully received response. Never
    send a partial control marker to speech synthesis.
    """
    pending = ""
    ending = False
    async for token in tokens:
        if ending:
            if token.strip():
                raise ValueError("Текст после сигнала завершения разговора")
            continue
        pending += token
        if END_CALL_MARKER in pending:
            speech, trailing = pending.split(END_CALL_MARKER, 1)
            if trailing.strip():
                raise ValueError("Сигнал завершения должен находиться в конце ответа")
            if speech:
                yield speech
            pending = ""
            ending = True
            continue
        held = 0
        for size in range(1, min(len(pending), len(END_CALL_MARKER) - 1) + 1):
            if pending.endswith(END_CALL_MARKER[:size]):
                held = size
        ready = pending[:-held] if held else pending
        pending = pending[-held:] if held else ""
        if ready:
            yield ready
    if pending:
        raise ValueError("Незавершённый служебный маркер в ответе модели")
    if ending:
        yield DialogueControl.END_CALL
