"""Durable SQL jobs with leases and fenced commits, isolated from the Speech process."""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from speech112.preparation.evaluation import evaluate
from speech112.runtime.bundle import ScenarioBundle

LOG = logging.getLogger(__name__)


class JobWorker:
    def __init__(self, dsn: str, semantic=None, prepare=None):
        self.dsn, self.semantic = dsn, semantic
        self.prepare = prepare

    def connect(self):
        return psycopg.connect(self.dsn, row_factory=dict_row)

    def claim(self):
        with self.connect() as db:
            job = db.execute("""
                SELECT * FROM background_job WHERE state='queued' OR
                (state='running' AND lease_until<now())
                ORDER BY CASE kind WHEN 'evaluate_attempt' THEN 0 ELSE 1 END,created_at
                FOR UPDATE SKIP LOCKED LIMIT 1
                """).fetchone()
            if job is None:
                return None
            if job["tries"] >= 3:
                db.execute(
                    (
                        "UPDATE background_job SET state='failed',error='Lease expired after 3 "
                        "attempts',finished_at=now() WHERE id=%s "
                    ),
                    (job["id"],),
                )
                if job["scenario_id"]:
                    db.execute(
                        "UPDATE scenario SET status='failed' "
                        "WHERE id=%s AND status='preparing'",
                        (job["scenario_id"],),
                    )
                return None
            token = uuid.uuid4()
            db.execute(
                """
                UPDATE background_job SET state='running',tries=tries+1,lease_token=%s,
                lease_until=now()+interval '60 seconds',error=NULL WHERE id=%s
                """,
                (token, job["id"]),
            )
            job["lease_token"] = token
            return job

    def renew(self, job):
        with self.connect() as db:
            return (
                db.execute(
                    """
                UPDATE background_job SET lease_until=now()+interval '60 seconds'
                WHERE id=%s AND lease_token=%s AND state='running' AND lease_until>now()
                """,
                    (job["id"], job["lease_token"]),
                ).rowcount
                == 1
            )

    def compute(self, job):
        # Fetch immutable inputs and release the connection before CPU work.
        with self.connect() as db:
            if job["kind"] == "compile_scenario":
                scenario = db.execute(
                    "SELECT document FROM scenario WHERE id=%s", (job["scenario_id"],)
                ).fetchone()
            elif job["kind"] == "evaluate_attempt":
                attempt = db.execute(
                    "SELECT a.*,s.document FROM training_attempt a "
                    "JOIN lesson_assignment la ON la.id=a.assignment_id "
                    "JOIN lesson l ON l.id=la.lesson_id "
                    "JOIN scenario s ON s.id=l.scenario_id WHERE a.id=%s",
                    (job["attempt_id"],),
                ).fetchone()
                events = db.execute(
                    "SELECT * FROM attempt_event WHERE attempt_id=%s ORDER BY sequence",
                    (job["attempt_id"],),
                ).fetchall()
            else:
                raise ValueError("Unknown job type")
        if job["kind"] == "compile_scenario":
            bundle = ScenarioBundle.compile(scenario["document"])
            if self.prepare is not None:
                self.prepare(bundle)
            return bundle
        if attempt["status"] not in ("completed", "failed"):
            raise ValueError("Cannot evaluate an active attempt")
        return evaluate(
            attempt["document"],
            attempt["card"],
            events,
            attempt_status=attempt["status"],
            semantic=self.semantic,
        )

    def commit(self, job, output=None, error=None):
        with self.connect() as db:
            owned = db.execute(
                """
                SELECT id FROM background_job WHERE id=%s AND lease_token=%s
                AND state='running' AND lease_until>now() FOR UPDATE
                """,
                (job["id"], job["lease_token"]),
            ).fetchone()
            if owned is None:
                return False
            if job["kind"] == "compile_scenario":
                if error is None:
                    db.execute(
                        (
                            "UPDATE scenario SET status=CASE WHEN approved_by IS NULL "
                            "THEN 'prepared' ELSE 'approved' END,artifact=%s,"
                            "artifact_sha256=%s "
                            "WHERE id=%s AND status='preparing' "
                        ),
                        (output.payload.decode(), output.digest, job["scenario_id"]),
                    )
                else:
                    db.execute(
                        "UPDATE scenario SET status='failed' "
                        "WHERE id=%s AND status='preparing'",
                        (job["scenario_id"],),
                    )
            elif error is None:
                db.execute(
                    """
                    INSERT INTO attempt_evaluation
                    (attempt_id,scenario_id,result,evaluator_version)
                    SELECT a.id,l.scenario_id,%s,'contextual-semantic-v2' FROM training_attempt a
                    JOIN lesson_assignment la ON la.id=a.assignment_id
                    JOIN lesson l ON l.id=la.lesson_id WHERE a.id=%s
                    ON CONFLICT (attempt_id) DO NOTHING
                    """,
                    (Jsonb(output), job["attempt_id"]),
                )
            db.execute(
                "UPDATE background_job SET state=%s,error=%s,finished_at=now(),lease_until=NULL "
                "WHERE id=%s",
                ("failed" if error else "completed", error, job["id"]),
            )
            db.execute(
                "INSERT INTO audit_event(action,entity_id,detail) VALUES (%s,%s,%s)",
                (
                    "job.failed" if error else "job.completed",
                    job["id"],
                    Jsonb({"kind": job["kind"]}),
                ),
            )
            return True

    def run_once(self):
        job = self.claim()
        if job is None:
            return False
        # No DB transaction or row lock remains open while a model/processor is running.
        with ThreadPoolExecutor(max_workers=1, thread_name_prefix="preparation") as executor:
            future = executor.submit(self.compute, job)
            try:
                while True:
                    try:
                        result = future.result(timeout=15)
                        break
                    except TimeoutError:
                        if not self.renew(job):
                            LOG.error("Job lease lost: %s", job["id"])
                            return True
                self.commit(job, output=result)
            except Exception as error:
                LOG.exception("Job %s failed", job["id"])
                # Do not persist exceptions containing full source documents or credentials.
                self.commit(job, error=type(error).__name__)
        return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    from speech112.preparation.audio import AudioPreparer
    from speech112.preparation.semantic import SemanticCardEvaluator

    prepare = AudioPreparer()
    worker = JobWorker(
        os.environ.get("TRAINING_DATABASE_URL", ""),
        semantic=SemanticCardEvaluator(prepare.recognizer),
        prepare=prepare,
    )
    while True:
        worked = worker.run_once()
        if args.once:
            return
        if not worked:
            time.sleep(1)


def compile_main():
    parser = argparse.ArgumentParser(
        description="Validate and compile a scenario without loading models"
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    bundle = ScenarioBundle.compile(json.loads(args.source.read_text()))
    args.output.write_bytes(bundle.payload)
    print(bundle.digest)
