"""Unit tests for pipeline database helpers."""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.db import get_all_predictions


class TestGetAllPredictions(unittest.TestCase):
    @patch("utils.db.get_client")
    def test_fetches_calibration_fields_without_embedded_relationship(self, mock_get_client):
        client = MagicMock()
        query = client.table.return_value
        query.select.return_value = query
        expected = [{"predicted_probability": 0.72, "correct": True}]
        query.execute.return_value = MagicMock(data=expected)
        mock_get_client.return_value = client

        result = get_all_predictions()

        client.table.assert_called_once_with("prediction_results")
        query.select.assert_called_once_with("predicted_probability, correct")
        self.assertEqual(result, expected)


if __name__ == "__main__":
    unittest.main()
