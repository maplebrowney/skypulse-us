#!/usr/bin/env bash
set -euo pipefail

APP_NAME="SkyPulseUS"
VERSION="1.0.0"
BUILD_DIR="build"
ARCHIVE_PATH="${BUILD_DIR}/${APP_NAME}.xcarchive"
PAYLOAD_DIR="${BUILD_DIR}/Payload"
IPA_NAME="${APP_NAME}-SideStore-LiveContainer.ipa"
IPA_PATH="${BUILD_DIR}/${IPA_NAME}"

echo "==> Packaging unsigned ${APP_NAME} v${VERSION} for SideStore & LiveContainer"
mkdir -p "${PAYLOAD_DIR}"
rm -rf "${PAYLOAD_DIR:?}/"*

APP_BUNDLE="${ARCHIVE_PATH}/Products/Applications/${APP_NAME}.app"
if [ ! -d "${APP_BUNDLE}" ]; then
  echo "Error: Expected .app bundle at ${APP_BUNDLE}" >&2
  exit 1
fi

cp -R "${APP_BUNDLE}" "${PAYLOAD_DIR}/"
# Strip embedded provisioning profiles & code signature for clean SideStore/LiveContainer re-signing
rm -rf "${PAYLOAD_DIR}/${APP_NAME}.app/_CodeSignature" "${PAYLOAD_DIR}/${APP_NAME}.app/embedded.mobileprovision"

(cd "${BUILD_DIR}" && zip -qry "${IPA_NAME}" Payload)

SHA256=$(shasum -a 256 "${IPA_PATH}" | awk '{print $1}')
SIZE_BYTES=$(wc -c < "${IPA_PATH}" | tr -d ' ')

echo "IPA_PATH=${IPA_PATH}"
echo "SHA256=${SHA256}"
echo "SIZE_BYTES=${SIZE_BYTES}"
