import https from 'https';

/**
 * セッションを確立する（FAQ検索ページにアクセス）
 */
export function establishSession(): Promise<string> {
  const url = 'https://www.db.yugioh-card.com/yugiohdb/faq_search.action?ope=1&request_locale=ja';

  console.log('セッションを確立中...');

  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => { chunks.push(chunk); });
      res.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8');
        const cookies: string[] = [];
        const setCookieHeaders = res.headers['set-cookie'];
        if (setCookieHeaders) {
          setCookieHeaders.forEach(cookie => {
            const match = cookie.match(/^([^=]+=[^;]+)/);
            if (match) {
              cookies.push(match[1]);
            }
          });
        }
        const cookieJar = cookies.join('; ');
        console.log(`✓ セッション確立完了 (${cookies.length} cookies)\n`);
        resolve(cookieJar);
      });
    }).on('error', (error) => {
      console.error('セッション確立エラー:', error);
      resolve('');
    });
  });
}
