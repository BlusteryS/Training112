#!/usr/bin/env python3
"""Configure the server address and issue a certificate for its local IP."""

import ipaddress
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
TLS = ROOT / "deploy" / "tls"


def openssl(*args):
    try:
        subprocess.run(["openssl", *args], check=True, cwd=TLS,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    except subprocess.CalledProcessError as error:
        raise ValueError(error.stderr.strip()) from error


def main():
    if not sys.stdin.isatty():
        raise ValueError("Запустите настройку в интерактивном терминале.")
    if shutil.which("openssl") is None:
        raise ValueError("Установите OpenSSL на сервере.")
    env_path = ROOT / ".env"
    values = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    current = values.get("SERVER_IP", "")
    address = input(f"IPv4-адрес сервера в локальной сети{f' [{current}]' if current else ''}: ").strip() or current
    ip = ipaddress.IPv4Address(address)
    if ip.is_unspecified or ip.is_multicast or ip.is_loopback or ip.is_link_local:
        raise ValueError("Укажите постоянный IPv4-адрес сервера в локальной сети.")
    os.umask(0o077)
    TLS.mkdir(mode=0o700, parents=True, exist_ok=True)
    TLS.chmod(0o700)
    if not (TLS / "ca.key").exists() and not (TLS / "ca.crt").exists():
        openssl("req", "-x509", "-newkey", "rsa:3072", "-nodes", "-sha256", "-days", "3650",
                "-subj", "/CN=Training112 Local CA", "-keyout", "ca.key", "-out", "ca.crt",
                "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
                "-addext", "keyUsage=critical,keyCertSign,cRLSign")
    elif not (TLS / "ca.key").exists() or not (TLS / "ca.crt").exists():
        raise ValueError("Отсутствует ключ или сертификат локального центра. Восстановите deploy/tls из резервной копии.")
    extensions = TLS / "server.ext"
    extensions.write_text(f"subjectAltName=IP:{ip}\nbasicConstraints=critical,CA:FALSE\n"
                          "keyUsage=critical,digitalSignature,keyEncipherment\n"
                          "extendedKeyUsage=serverAuth\n")
    try:
        openssl("req", "-new", "-newkey", "rsa:2048", "-nodes", "-sha256",
                "-subj", f"/CN={ip}", "-keyout", "server.key", "-out", "server.csr")
        openssl("x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key",
                "-CAcreateserial", "-days", "365", "-sha256", "-extfile", "server.ext", "-out", "server.crt")
    finally:
        extensions.unlink(missing_ok=True)
        (TLS / "server.csr").unlink(missing_ok=True)
    # The directory is private on the host; only these two files are mounted into nginx.
    (TLS / "server.crt").chmod(0o644)
    (TLS / "server.key").chmod(0o644)
    password = values.get("DB_PASSWORD")
    if not password or password == "replace-with-a-long-random-password":
        password = secrets.token_hex(32)
    env_path.write_text(f"SERVER_IP={ip}\nDB_PASSWORD={password}\n")
    env_path.chmod(0o600)
    print(f"Адрес тренажёра: https://{ip}")
    print("Далее выполните:")
    print("  1. docker compose up -d --build")
    print("  2. docker compose exec backend create-admin (при первой установке)")
    print("  3. Установите deploy/tls/ca.crt на рабочих местах (README.md, пункт 3.3).")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(f"Настройка не завершена: {error}")
