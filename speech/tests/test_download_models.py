import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from speech112.download_models import MODEL_REVISION, prepare_model


class ModelDownloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name) / "model"
        self.api_patch = patch("speech112.download_models.HfApi")
        self.api = self.api_patch.start()
        self.addCleanup(self.api_patch.stop)
        self.api.return_value.model_info.return_value = SimpleNamespace(
            sha=MODEL_REVISION,
            siblings=[
                SimpleNamespace(rfilename="config.json", size=2),
                SimpleNamespace(rfilename="model.safetensors", size=7),
            ],
        )

    def download(self, **kwargs):
        self.assertEqual(kwargs["revision"], MODEL_REVISION)
        directory = kwargs["local_dir"]
        (directory / "config.json").write_text("{}")
        (directory / "model.safetensors").write_bytes(b"weights")

    def test_completed_download_is_reused_without_network(self):
        with patch(
            "speech112.download_models.snapshot_download", side_effect=self.download
        ) as call:
            prepare_model(self.directory)
            prepare_model(self.directory)
        self.assertEqual(call.call_count, 1)
        self.assertEqual(self.api.return_value.model_info.call_count, 1)

    def test_interrupted_download_is_retried_and_only_then_marked_complete(self):
        def interrupted(**kwargs):
            (kwargs["local_dir"] / "config.json").write_text("{}")
            raise ConnectionError("offline")

        with (
            patch("speech112.download_models.snapshot_download", side_effect=interrupted),
            self.assertRaisesRegex(RuntimeError, "загрузка продолжится"),
        ):
            prepare_model(self.directory)
        self.assertFalse((self.directory / ".download-complete.json").exists())
        with patch(
            "speech112.download_models.snapshot_download", side_effect=self.download
        ) as call:
            prepare_model(self.directory)
        call.assert_called_once()

    def test_missing_or_truncated_file_triggers_repair(self):
        with patch(
            "speech112.download_models.snapshot_download", side_effect=self.download
        ) as call:
            prepare_model(self.directory)
            (self.directory / "model.safetensors").unlink()
            prepare_model(self.directory)
            (self.directory / "model.safetensors").write_bytes(b"w")
            prepare_model(self.directory)
        self.assertEqual(call.call_count, 3)

    def test_changed_revision_triggers_download(self):
        with patch(
            "speech112.download_models.snapshot_download", side_effect=self.download
        ) as call:
            prepare_model(self.directory)
            marker = self.directory / ".download-complete.json"
            manifest = json.loads(marker.read_text())
            manifest["revision"] = "old"
            marker.write_text(json.dumps(manifest))
            prepare_model(self.directory)
        self.assertEqual(call.call_count, 2)

    def test_empty_download_is_not_marked_complete(self):
        with (
            patch("speech112.download_models.snapshot_download"),
            self.assertRaisesRegex(RuntimeError, "Не удалось загрузить"),
        ):
            prepare_model(self.directory)
        self.assertFalse((self.directory / ".download-complete.json").exists())

    def test_hub_returning_partial_directory_is_not_success(self):
        def partial(**kwargs):
            (kwargs["local_dir"] / "config.json").write_text("{}")

        with (
            patch("speech112.download_models.snapshot_download", side_effect=partial),
            self.assertRaisesRegex(RuntimeError, "Не удалось загрузить"),
        ):
            prepare_model(self.directory)
        self.assertFalse((self.directory / ".download-complete.json").exists())


if __name__ == "__main__":
    unittest.main()
