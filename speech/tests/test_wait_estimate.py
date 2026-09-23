import unittest
from pathlib import Path
from unittest.mock import patch

from speech112.config import AppConfig
from speech112.wait_estimate import estimate_wait_seconds


class WaitEstimateTests(unittest.TestCase):
    def test_cold_start_accounts_for_elapsed_time(self):
        self.assertEqual(estimate_wait_seconds([100], [], 160), 120)

    def test_uses_median_and_earliest_free_slot(self):
        self.assertEqual(estimate_wait_seconds([100, 170], [100, 120, 1000], 180), 40)

    def test_long_call_keeps_positive_estimate(self):
        self.assertEqual(estimate_wait_seconds([0], [60], 200), 5)

    def test_preparing_or_free_node(self):
        self.assertEqual(estimate_wait_seconds([None], [60], 200), 5)
        self.assertEqual(estimate_wait_seconds([], [], 200), 5)

    @patch.dict("os.environ", {"SPEECH_LLM_URL": "http://localhost:8081/v1"})
    def test_each_random_voice_updates_caller_without_mutating_config(self):
        config = AppConfig.load(Path(__file__).parents[1] / "config/default.toml")
        original = config.voice_id
        for voice in config.voices:
            with patch("speech112.config.random.choice", return_value=voice):
                selected = config.for_random_voice()
            self.assertEqual(selected.voice_id, voice.id)
            self.assertEqual(selected.scenario.caller_name, voice.caller_name)
            self.assertEqual(selected.scenario.caller_age, voice.caller_age)
            self.assertEqual(config.voice_id, original)


if __name__ == "__main__":
    unittest.main()
