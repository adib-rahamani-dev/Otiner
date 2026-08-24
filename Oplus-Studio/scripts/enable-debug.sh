#!/usr/bin/env bash
set -euo pipefail

defaults write com.adobe.CSXS.12 PlayerDebugMode 1
echo "Enabled CEP 12 PlayerDebugMode for the current macOS user."
echo "Restart After Effects before loading an unsigned development build."
