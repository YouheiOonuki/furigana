#!/usr/bin/env python3
"""追加辞書（よく使う複合語）の読みを、辞書で確かめる。

使い方: python3 tools/verify-compounds.py tools/compounds-candidates.txt > tools/compounds-verified.tsv

- 候補（1 行 1 語。自分で書いたもの）ごとに コトバンク（https://kotobank.jp/word/<語>）を開き、
  「デジタル大辞泉」（小学館）の見出し（h3。例: おお‐ぜい〔おほ‐〕【大勢】）から、【】の中に候補の表記があるものの読みを集める。
- 読みが 1 つ → そのまま。2 つ以上 → 「読み分けあり」（amb=1。画面では印を付けたまま）で、
  コトバンクのページ見出しの読み（（読み）の後）がその中にあればそれを既定にする。無ければ最初の見出し。
- デジタル大辞泉に見出しが無い語は捨てる（推測で読みを書かない）。
- 1 秒に 1 回だけ取りに行く。定義文は写さない（読みの事実だけを使う）。
出力: 表記<TAB>読み（ひらがな）<TAB>amb<TAB>辞書の読みすべて（,区切り）<TAB>出典 URL
"""
import html
import re
import sys
import time
import urllib.parse
import urllib.request

KATA = str.maketrans({chr(c): chr(c - 0x60) for c in range(0x30A1, 0x30F7)})


def fetch(word):
    url = 'https://kotobank.jp/word/' + urllib.parse.quote(word)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (furigana dictionary check; yorozu-craft.com)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.geturl(), r.read().decode('utf-8', 'replace')


def text(s):
    return re.sub(r'\s+', '', html.unescape(re.sub(r'<[^>]+>', '', s)))


def readings(word, page):
    out = []
    for part in re.split(r'<h2[^>]*>', page)[1:]:
        name = text(part.split('</h2>')[0])
        if not name.startswith('デジタル大辞泉「'):   # 「デジタル大辞泉プラス」（百科項目）は使わない
            continue
        for h in re.findall(r'<h3[^>]*>(.*?)</h3>', part, re.S):
            h = text(h)
            m = re.match(r'^([ぁ-ゖー‐・]+)(?:〔[^〕]*〕)?【([^】]+)】$', h)
            if not m:
                continue
            # 【】の中の記号（‐ 熟字訓の区切り、＝ ×  ▽ △ 表外の字・読みの印）を外して表記を比べる
            forms = [re.sub(r'[‐＝×▽△◇]', '', f) for f in re.split(r'[／・]', m.group(2))]
            if word not in forms:
                continue
            r = m.group(1).replace('‐', '').replace('・', '')
            if r not in out:
                out.append(r)
    return out


def main():
    words = [w.strip() for w in open(sys.argv[1], encoding='utf-8') if w.strip() and not w.startswith('#')]
    for w in words:
        try:
            url, page = fetch(w)
        except Exception as e:  # 404 など: 辞書に無い
            print(f'# {w}\t取得できず（{e}）', file=sys.stderr)
            time.sleep(1)
            continue
        rs = readings(w, page)
        if not rs:
            print(f'# {w}\tデジタル大辞泉に見出しなし', file=sys.stderr)
        else:
            m = re.search(r'（読み）([ァ-ヶー]+)', page)
            top = m.group(1).translate(KATA) if m else ''
            default = top if top in rs else rs[0]
            print('\t'.join([w, default, '1' if len(rs) > 1 else '0', ','.join(rs), url]))
            sys.stdout.flush()
        time.sleep(1)


if __name__ == '__main__':
    main()
