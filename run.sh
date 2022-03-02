#!/usr/bin/env bash

docker run \
--rm \
--tty \
--volume "${PWD}:${PWD}" \
--workdir "${PWD}" \
--env LOCATION_NAME \
--env LOCATION_INPUT_ID \
--env MAX_ROWS \
buildkite/puppeteer \
main.js
