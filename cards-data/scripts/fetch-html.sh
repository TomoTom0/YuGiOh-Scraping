#!/bin/bash
# カード検索結果HTMLをダウンロードするスクリプト

OUTPUT_DIR="$(dirname "$0")/cards"
COOKIE_FILE="/tmp/ygo-cards-cookies.txt"

# 出力ディレクトリ作成
mkdir -p "$OUTPUT_DIR"

# 1ページあたり2000件、全10ページ（約14000件をカバー）
RESULTS_PER_PAGE=2000
TOTAL_PAGES=10

echo "=== カード検索結果HTMLダウンロード ==="
echo "出力先: $OUTPUT_DIR"
echo ""

for page in $(seq 1 $TOTAL_PAGES); do
    OUTPUT_FILE="$OUTPUT_DIR/page-${page}.html"

    # ページ番号パラメータ（2ページ目以降はpageパラメータが必要）
    if [ $page -eq 1 ]; then
        PAGE_PARAM=""
    else
        PAGE_PARAM="&page=${page}"
    fi

    URL="https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=1&sess=1&rp=${RESULTS_PER_PAGE}&mode=&sort=1&keyword=&stype=1&othercon=2&request_locale=ja${PAGE_PARAM}"

    echo "ダウンロード中: ページ ${page}/${TOTAL_PAGES}"
    echo "  URL: $URL"

    curl -s \
        -c "$COOKIE_FILE" \
        -b "$COOKIE_FILE" \
        -o "$OUTPUT_FILE" \
        "$URL"

    # ダウンロード結果確認
    if [ -f "$OUTPUT_FILE" ]; then
        CARD_COUNT=$(grep -c 't_row' "$OUTPUT_FILE" 2>/dev/null || echo "0")
        FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
        echo "  保存完了: $OUTPUT_FILE (サイズ: $FILE_SIZE, t_row数: $CARD_COUNT)"
    else
        echo "  エラー: ダウンロード失敗"
    fi

    # サーバー負荷軽減のため1秒待機
    if [ $page -lt $TOTAL_PAGES ]; then
        sleep 1
    fi

    echo ""
done

echo "=== ダウンロード完了 ==="
ls -lh "$OUTPUT_DIR"/*.html
