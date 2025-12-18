import https from 'https';
import { JSDOM } from 'jsdom';
import { convertCardLinksToTemplate } from './formatters.js';

const CONFIG = {
  BASE_URL: 'https://www.db.yugioh-card.com/yugiohdb/faq_search.action',
  LOCALE: 'ja',
};

/**
 * FAQ詳細情報
 */
export interface FaqDetail {
  faqId: string;
  question: string;
  answer: string;
  updatedAt?: string;
}

/**
 * カード詳細情報
 */
export interface CardDetail {
  cardId: string;
  cardName: string;
  supplementInfo?: string;
  supplementDate?: string;
  pendulumSupplementInfo?: string;
  pendulumSupplementDate?: string;
}

/**
 * FAQ詳細を取得
 */
export function fetchFaqDetail(faqId: string, cookieJar: string): Promise<FaqDetail | null> {
  const url = `${CONFIG.BASE_URL}?ope=5&fid=${faqId}&request_locale=${CONFIG.LOCALE}`;

  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookieJar
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => { chunks.push(chunk); });
      res.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8');
        try {
          const dom = new JSDOM(html, { url });
          const doc = dom.window.document as unknown as Document;

          const questionElem = doc.querySelector('#question_text');
          if (!questionElem) {
            resolve(null);
            return;
          }
          const question = convertCardLinksToTemplate(questionElem as HTMLElement);

          if (!question) {
            resolve(null);
            return;
          }

          const answerElem = doc.querySelector('#answer_text');
          let answer = '';
          if (answerElem) {
            answer = convertCardLinksToTemplate(answerElem as HTMLElement);
          }

          const dateElem = doc.querySelector('#tag_update .date');
          const updatedAt = dateElem?.textContent?.trim() || undefined;

          resolve({
            faqId,
            question,
            answer,
            updatedAt
          });
        } catch (error) {
          console.error(`Parse error for FAQ ${faqId}:`, error);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error(`Request error for FAQ ${faqId}:`, error);
      resolve(null);
    });
  });
}

/**
 * カード詳細を取得
 */
export function fetchCardDetail(cardId: string, cookieJar: string): Promise<CardDetail | null> {
  const url = `${CONFIG.BASE_URL}?ope=4&cid=${cardId}&request_locale=${CONFIG.LOCALE}`;

  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookieJar
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => { chunks.push(chunk); });
      res.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8');
        try {
          const dom = new JSDOM(html, { url });
          const doc = dom.window.document as unknown as Document;

          const titleElem = doc.querySelector('title');
          const title = titleElem?.textContent || '';
          const cardName = title.split('|')[0]?.trim() || '';

          let supplementInfo: string | undefined = undefined;
          let supplementDate: string | undefined = undefined;
          let pendulumSupplementInfo: string | undefined = undefined;
          let pendulumSupplementDate: string | undefined = undefined;

          const supplementElems = doc.querySelectorAll('.supplement');

          supplementElems.forEach(supplementElem => {
            const textElem = supplementElem.querySelector('.text');
            if (!textElem) return;

            const textId = textElem.id;

            const dateElem = supplementElem.querySelector('.title .update');
            const date = dateElem?.textContent?.trim() || undefined;

            const cloned = textElem.cloneNode(true) as HTMLElement;
            cloned.querySelectorAll('br').forEach(br => {
              br.replaceWith('\n');
            });

            cloned.querySelectorAll('a[href*="cid="]').forEach(link => {
              const href = link.getAttribute('href') || '';
              const match = href.match(/[?&]cid=(\d+)/);
              if (match && match[1]) {
                const linkCardId = match[1];
                const cardLinkName = link.textContent?.trim() || '';
                link.replaceWith(`{{${cardLinkName}|${linkCardId}}}`);
              }
            });

            const text = cloned.textContent?.trim() || undefined;

            if (textId === 'pen_supplement') {
              pendulumSupplementInfo = text;
              pendulumSupplementDate = date;
            } else if (textId === 'supplement') {
              supplementInfo = text;
              supplementDate = date;
            }
          });

          resolve({
            cardId,
            cardName,
            supplementInfo,
            supplementDate,
            pendulumSupplementInfo,
            pendulumSupplementDate
          });
        } catch (error) {
          console.error(`Parse error for card ${cardId}:`, error);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error(`Request error for card ${cardId}:`, error);
      resolve(null);
    });
  });
}
