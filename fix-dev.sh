#!/bin/bash
# Fix .next permission issues after running with sudo.
# Run once: sudo ./fix-dev.sh
set -e
echo "Removing .next cache..."
sudo rm -rf .next
echo "Done. Run: npm run dev  (port 3000, no sudo needed)"
