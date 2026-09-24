#!/usr/bin/env python3
"""読み分けのある語（どちらの読みも辞書にある語）を、辞書で確かめる。

使い方: python3 tools/verify-ambiguous.py tools/ambiguous-candidates.txt > tools/ambiguous-verified.tsv

- 候補（tools/ambiguous-candidates.txt。自分で書いたもの）は「トークンの表記」と「見出し:見出しの読み:表記での読み[:引くページ]」の組。
- 見出しごとに コトバンク（https://kotobank.jp/word/<見出し>）を開き、「デジタル大辞泉」（小学館）の見出し（h3）のうち
  【】の中にその表記があるものの読みを集める（読みの集め方は tools/verify-compounds.py と同じ）。
- 見出しの読みが辞書に無い組は捨てる。確かめられた読みが 2 つ以上残った語だけを「読み分けあり」として出す（推測で読みを足さない）。
- 1 秒に 1 回だけ取りに行く。定義文は写さない（読みの事実だけを使う）。
出力: 表記<TAB>表記での読み（, 区切り。確かめられたものだけ）<TAB>確かめた見出しと読み<TAB>出典 URL（, 区切り）
"""
import importlib.util
import os
import re
import sys
import time

spec = importlib.util.spec_from_file_location('vc', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verify-compounds.py'))
vc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vc)

cache = {}


def readings(word, page):
    # 【】の中の〔〕（歴史的仮名遣いや別の送り仮名。例: 【行う〔行なう〕】）を外してから verify-compounds.py と同じく集める
    return vc.readings(word, re.sub(r'(【[^】]*?)〔[^〕]*〕', r'\1', page))


def dict_readings(page_title, head):
    if page_title not in cache:
        try:
            cache[page_title] = vc.fetch(page_title)
        except Exception as e:  # 404 など
            print(f'# {page_title}\t取得できず（{e}）', file=sys.stderr)
            cache[page_title] = ('', '')
        time.sleep(1)
    url, page = cache[page_title]
    return url, readings(head, page) if page else []


def main():
    for line in open(sys.argv[1], encoding='utf-8'):
        line = line.rstrip('\n')
        if not line.strip() or line.startswith('#'):
            continue
        form, pairs = line.split('\t')
        ok, heads, urls = [], [], []
        for p in pairs.split(','):
            head, hr, fr, *pg = p.split(':')
            url, rs = dict_readings(pg[0] if pg else head, head)
            if hr in rs:
                if fr not in ok:
                    ok.append(fr)
                heads.append(f'{hr}【{head}】')
                if url not in urls:
                    urls.append(url)
            else:
                print(f'# {form}\t{hr}【{head}】はデジタル大辞泉の見出しに無い（見出しの読み: {",".join(rs) or "なし"}）', file=sys.stderr)
        if len(ok) >= 2:
            print('\t'.join([form, ','.join(ok), ' '.join(heads), ','.join(urls)]))
            sys.stdout.flush()
        else:
            print(f'# {form}\t確かめられた読みが 1 つ以下なので入れない', file=sys.stderr)


if __name__ == '__main__':
    main()
