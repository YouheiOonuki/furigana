#!/usr/bin/env python3
"""追加辞書 data/extra-dict.json を作る（決定 D71）。

使い方: python3 tools/build-extra-dict.py [000925835.xlsx]
  - xlsx を省くと総務省のサイトから取得する（openpyxl が要る）

中身:
1. 市区町村名・都道府県名: 総務省「全国地方公共団体コード」の「都道府県コード及び市区町村コード」（令和6年1月1日更新）
   https://www.soumu.go.jp/denshijiti/code.html （Excel: https://www.soumu.go.jp/main_content/000925835.xlsx）
   利用条件: 総務省ホームページの「当省ホームページについて」（https://www.soumu.go.jp/menu_kyotsuu/policy/tyosaku.html）
   により「公共データ利用規約（第1.0版）」（CC BY 4.0 互換）。出典を書き、加工したことを書く（使い方ページと README）。
   加工: 半角カナの読みをひらがなにし、同じ表記で読みが違う名前（例: 朝日町）は入れない。政令指定都市の区は「札幌市中央区」の形と、
   全国で読みが 1 つに決まる区名（「中央区」など）だけ入れる。都道府県名は「都・府・県」を外した形（東京・大阪）も入れる（三重は除く）。
2. よく使う複合語: tools/compounds-verified.tsv（tools/verify-compounds.py がデジタル大辞泉の見出しで確かめたもの）のうち、
   tools/compounds-selected.txt に書いた語（200 語まで）。
"""
import json
import os
import sys
import unicodedata
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX_URL = 'https://www.soumu.go.jp/main_content/000925835.xlsx'
MAX_COMPOUNDS = 200


def hira(s):
    s = unicodedata.normalize('NFKC', s)
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)


def load_places(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True)
    names = {}   # 表記 -> 読みの集合

    def add(name, kana):
        if not name or not kana:
            return
        name = unicodedata.normalize('NFKC', str(name)).strip()
        names.setdefault(name, set()).add(hira(str(kana)).strip())

    ward = {}
    global PREFS
    PREFS = set()
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))[1:]
        for r in rows:
            pref, city, pref_kana, city_kana = r[1], r[2], r[3], r[4]
            add(pref, pref_kana)
            if pref:
                PREFS.add(unicodedata.normalize('NFKC', str(pref)).strip())
            add(city, city_kana)
            if '政令' in ws.title and city and city_kana:
                # 「札幌市中央区」→「中央区」も（全国で読みが 1 つのときだけ、下で絞る）
                c = unicodedata.normalize('NFKC', city)
                k = hira(city_kana)
                i = c.find('市')
                if 0 < i < len(c) - 1 and c.endswith('区'):
                    parent = c[:i + 1]
                    pk = [hira(x[4]) for x in rows if x[2] == parent]
                    if pk and k.startswith(pk[0]):
                        ward.setdefault(c[i + 1:], set()).add(k[len(pk[0]):])
    for w, ks in ward.items():
        names.setdefault(w, set()).update(ks)
    # 都道府県名の「都・府・県」を外した形（東京・大阪・青森…）。三重 は「さんじゅう」とも読む語なので入れない
    for n, ks in list(names.items()):
        if len(ks) != 1:
            continue
        k = next(iter(ks))
        for suf, ksuf in (('都', 'と'), ('府', 'ふ'), ('県', 'けん')):
            if n in PREFS and n.endswith(suf) and k.endswith(ksuf):
                stem = n[:-1]
                if stem not in ('三重',):
                    names.setdefault(stem, set()).add(k[:-len(ksuf)])
    ok = {n: next(iter(ks)) for n, ks in names.items() if len(ks) == 1}
    dropped = sorted(n for n, ks in names.items() if len(ks) > 1)
    return ok, dropped


def load_compounds():
    verified = {}
    with open(os.path.join(ROOT, 'tools', 'compounds-verified.tsv'), encoding='utf-8') as f:
        for line in f:
            if not line.strip() or line.startswith('#'):
                continue
            w, reading, amb, _all, url = line.rstrip('\n').split('\t')
            verified[w] = (reading, amb == '1', url)
    selected = []
    with open(os.path.join(ROOT, 'tools', 'compounds-selected.txt'), encoding='utf-8') as f:
        for line in f:
            line = line.split('#')[0].strip()
            if not line:
                continue
            w, _, override = line.partition(' ')
            if w not in verified:
                raise SystemExit(f'{w}: compounds-verified.tsv に無い（辞書で確かめていない語は入れない）')
            reading, amb, url = verified[w]
            override = override.strip()
            if override:
                # 読み分けのある語で既定の読みを選び直すとき。辞書の読みの 1 つでなければ止める
                allr = [l.split('\t')[3] for l in open(os.path.join(ROOT, 'tools', 'compounds-verified.tsv'), encoding='utf-8') if l.startswith(w + '\t')][0].split(',')
                if override not in allr:
                    raise SystemExit(f'{w}: {override} は辞書の読み {allr} に無い')
                reading = override
            selected.append((w, reading, amb))
    if len(selected) > MAX_COMPOUNDS:
        raise SystemExit(f'複合語は {MAX_COMPOUNDS} 語まで（今 {len(selected)}）')
    return selected


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if not path:
        path = '/tmp/000925835.xlsx'
        urllib.request.urlretrieve(XLSX_URL, path)
    places, dropped = load_places(path)
    compounds = load_compounds()
    entries = {}
    for n, k in sorted(places.items()):
        entries[n] = [k, 'p']            # p: 地名（固有名詞でも振る）
    for w, r, amb in compounds:
        entries[w] = [r, 'a' if amb else '']   # a: 読み分けあり（印を付けたまま）
    out = {
        'version': '2026-09-24',
        'note': 'ふりがなメーカーの追加辞書。tools/build-extra-dict.py で作る。地名は総務省「全国地方公共団体コード」（公共データ利用規約 第1.0版）を加工、複合語はデジタル大辞泉（コトバンク）の見出しで読みを確かめた語',
        'counts': {'places': len(places), 'placesDropped': len(dropped), 'compounds': len(compounds)},
        'placesDropped': dropped,
        'entries': entries,
    }
    with open(os.path.join(ROOT, 'data', 'extra-dict.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
    print(f'地名 {len(places)}（読みが割れて外した {len(dropped)}: {"・".join(dropped[:20])}…）、複合語 {len(compounds)}')


if __name__ == '__main__':
    main()
