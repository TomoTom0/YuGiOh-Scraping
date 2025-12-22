#!/bin/bash

# 最新のTSVファイルをGitHub Releasesからダウンロード
# テスト実行前に既存TSVファイルが必要な場合に使用

set -e

REPO_OWNER="TomoTom0"
REPO_NAME="YuGiOh-Scraping"
OUTPUT_DIR="output/data"

echo "=== 最新のTSVファイルをダウンロードします ==="
echo ""

# 出力ディレクトリを作成
mkdir -p "$OUTPUT_DIR"

# 最新リリースのアセット情報を取得
echo "最新リリース情報を取得中..."
LATEST_RELEASE_URL=$(curl -s "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/latest" | grep "browser_download_url.*tar.gz" | cut -d '"' -f 4)

if [ -z "$LATEST_RELEASE_URL" ]; then
  echo "エラー: 最新リリースが見つかりませんでした"
  exit 1
fi

echo "ダウンロードURL: $LATEST_RELEASE_URL"
echo ""

# tar.gzファイルをダウンロード
# 一時ディレクトリを作成
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT # スクリプト終了時に一時ディレクトリを削除

# tar.gzファイルをダウンロード
TEMP_FILE="$TEMP_DIR/ygo-data-latest.tar.gz"
echo "ダウンロード中..."
curl -L "$LATEST_RELEASE_URL" -o "$TEMP_FILE"

echo "展開中..."
tar -xzf "$TEMP_FILE" -C "$OUTPUT_DIR"

echo ""
echo "=== ダウンロード完了 ==="
echo "TSVファイル:"
ls -lh "$OUTPUT_DIR"/*.tsv 2>/dev/null || echo "  (TSVファイルが見つかりませんでした)"
