#!/bin/bash
# Stops whatever is listening on a port (default 4000, the Jekyll server), so ./run.sh can start fresh.
# Usage: ./reset_port.sh [port]

PORT="${1:-4000}"
PIDS=$(lsof -ti tcp:"$PORT" -sTCP:LISTEN)

if [ -z "$PIDS" ]; then
  echo "-------- nothing is listening on port $PORT"
  exit 0
fi

echo "-------- stopping on port $PORT:"
ps -o pid=,command= -p $(echo $PIDS | tr ' ' ',')
kill $PIDS

# Give the processes a moment to shut down cleanly, then force anything still running.
for _ in 1 2 3 4 5; do
  sleep 1
  PIDS=$(lsof -ti tcp:"$PORT" -sTCP:LISTEN)
  [ -z "$PIDS" ] && break
done

if [ -n "$PIDS" ]; then
  echo "-------- forcing stop"
  kill -9 $PIDS
fi

echo "-------- port $PORT is free"
