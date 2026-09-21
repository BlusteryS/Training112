"""Optional CURVE authentication for remote Speech nodes."""

import os
from contextlib import contextmanager

import zmq
from zmq.auth.asyncio import AsyncioAuthenticator
from zmq.utils import z85


class AllowedClients:
    def __init__(self, keys: str):
        self.keys = {key.strip().encode("ascii") for key in keys.split(",")}
        for key in self.keys:
            if len(key) != 40 or len(z85.decode(key)) != 32:
                raise ValueError("SPEECH_CURVE_CLIENT_KEYS must contain Z85 public keys")

    def callback(self, domain: str, key: bytes) -> bool:
        return key in self.keys


@contextmanager
def secure_socket(context, socket):
    public = os.environ.get("SPEECH_CURVE_PUBLIC_KEY", "")
    secret = os.environ.get("SPEECH_CURVE_SECRET_KEY", "")
    clients = os.environ.get("SPEECH_CURVE_CLIENT_KEYS", "")
    if not any((public, secret, clients)):
        yield
        return
    if not all((public, secret, clients)):
        raise ValueError("Set server CURVE public/secret keys and allowed client keys together")
    for key in (public, secret):
        if len(key) != 40 or len(z85.decode(key.encode("ascii"))) != 32:
            raise ValueError("CURVE requires 40-character Z85 keys")
    if zmq.curve_public(secret.encode("ascii")) != public.encode("ascii"):
        raise ValueError("Server CURVE keys do not form a pair")
    allowed = AllowedClients(clients)
    auth = AsyncioAuthenticator(context)
    auth.start()
    try:
        auth.configure_curve_callback(credentials_provider=allowed)
        socket.curve_publickey = public.encode("ascii")
        socket.curve_secretkey = secret.encode("ascii")
        socket.curve_server = True
        socket.zap_domain = b"speech"
        yield
    finally:
        auth.stop()
