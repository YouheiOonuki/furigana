# ふりがなメーカー（furigana generator）

公開 URL: **https://yorozu-craft.com/furigana/**（英語版 **https://yorozu-craft.com/furigana/en/**）

貼った文に学年別のふりがな（ルビ）を振る。文はこの端末の中で解析し、外に送らない。
yorozu-craft のツールの1つです（共通ルールは [youheioonuki.github.io の README](https://github.com/YouheiOonuki/youheioonuki.github.io) を参照）。企画は yorozu-plans の `docs/15_ルビ後付け.md`（K34・K56、決定 D67〜D74）。

## 機能

- 文を貼る（10,000 字まで）→ 300ms 後に見本を更新。解析は Web Worker（`worker.js`）で、画面を止めない
- 読む人: すべて（1年生）・2〜6年生・中学生・大人（常用漢字の外だけ）。N 年生には N 年生の字から上を含む語に、語全体で振る（D69）
- 振らない: 未知語・固有名詞（追加辞書の地名は振る）
- 点線（自信のない読み。画面だけ、設定で印刷にも。D70）: 漢字 1 字だけの語、漢字だけのトークンが 2 つ以上続いて割れた語、追加辞書で読みが 2 つ以上ある語、「1日」
- 算用数字の後の「月」は がつ、「2〜10・14・20・24日」は日付の読み
- 語をタップして読みを直す → 端末の辞書（localStorage `furigana_dict`）に入り、次の文にも効く。一覧から消せる
- 出力: A4 印刷（横・縦書き、文字 3 段階、ルビは本文の 50%、広告は印刷しない、クレジットは `/furigana/print/` へ）、コピー（ルビつき HTML・青空文庫形式 `｜漢字《かんじ》`・括弧 `漢字（かんじ）`・ひらがなだけ）、大きな字で読む
- ふりがなの字: ひらがな／ローマ字（ヘボン式、長音記号。D74）
- ブックマークレット（PC、D73）: 選んだ文（なければ本文）を `#t=` で新しいタブに渡す。長い文は開いた先からの合図のあと `postMessage`。相手のページには書き込まない
- 保存: 本文・設定・直した読み（`furigana_text`・`furigana_settings`・`furigana_dict`）。ファイルに書き出し・読み込み（D31）
- オフライン: Service Worker（キャッシュ `furigana-v1`）。辞書は解析するときに初めて取る

## 解析器と辞書（D67・D68）

- **lindera-wasm-web-ipadic 2.0.0**（MIT）＋ IPADIC（mecab-ipadic 2.7.0、NAIST と ICOT の条件）。`dict/lindera-2.0.0/`（wasm 13,067,153 バイト、ほかに glue の JS）。表示は `dict/lindera-2.0.0/LICENSE-lindera-wasm.txt` と `NOTICE-IPADIC.txt`
- このツールだけ 00 の「単一 HTML・CDN なし」の例外（D67）。辞書は同じオリジンに置き、**文を解析するときだけ**読む（ページを開いただけでは読まない）。帯域が GitHub Pages の月 100GB に近づいたら jsDelivr（`cdn.jsdelivr.net/npm/lindera-wasm-web-ipadic@2.0.0/`）に移す
- kuromoji.js 0.1.2 と同じ規則で比べ、精度は同じ（下の表）。lindera は Node で RSS 増 約 136MB（kuromoji は 約 310MB、企画書 5.1）、転送量 13.1MB（kuromoji 17.8MB）なので lindera にした
- 更新: `npm install` → `node tools/copy-dict.mjs` → `constants.js` の `analyzer`・`sw.js`・`worker.js` の import のパスを新しい版に → `node tools/measure-tool.mjs` で測り直して使い方ページ（日英）の数字を直す

## 精度（受け入れテスト #1、2026-09-24）

青空文庫の児童文学 7 作品（ごん狐・手袋を買いに・花のき村と盗人たち・走れメロス・セロ弾きのゴーシュ・注文の多い料理店・よだかの星）、人手ルビ 1,604。読む人「すべて」。`node tools/measure-tool.mjs <作品の .utf8.html>`。

| 解析器 | 追加辞書 | 点線なしの一致 | 点線つきの一致 | 点線つきの割合 | 振らなかった | 範囲がずれた |
|---|---|---|---|---|---|---|
| lindera 2.0.0 | あり | **96.5%**（834/864） | 81.3%（471/579） | 40.1% | 68 | 92 |
| lindera 2.0.0 | なし | 96.4%（833/864） | 80.4%（465/578） | 40.1% | 68 | 93 |
| kuromoji 0.1.2 | あり | 96.5%（835/865） | 81.8%（473/578） | 40.1% | 68 | 92 |
| kuromoji 0.1.2 | なし | 96.4%（834/865） | 80.9%（467/577） | 40.0% | 68 | 93 |

- 合格基準（D33・企画書 7 章）の **96.9% には届いていない**（96.5%）。点線なしの誤りの多くは、送り仮名つきの 1 字の語（上り → のぼ／あが、廻る）と読み分けのある語（下手・黒子・面目）
- 参考: 企画書の「振る対象」（1 トークン・2 字以上・固有名詞でない・辞書語、yorozu-plans の `measure.mjs`）では lindera・kuromoji とも 96.9%（405/418）
- 参考: 送り仮名つきの 1 字の語（行く など）にも点線を付けると、点線なしは 97.1%（395/407）になるが、点線つきが 72% になる。規則は変えていない（オーナーの判断）
- 大人向けを含む 12 作品では点線なし 89.9%（2,722/3,028）

## 追加辞書（D71）

`data/extra-dict.json`（`python3 tools/build-extra-dict.py [xlsx]` で作る）。

- **地名 2,079**: 総務省「全国地方公共団体コード」都道府県コード及び市区町村コード（令和6年1月1日更新、https://www.soumu.go.jp/denshijiti/code.html ）を加工。利用条件は総務省サイトの「当省ホームページについて」で**公共データ利用規約（第1.0版）**（CC BY 4.0 互換）と確認（2026-09-24、https://www.soumu.go.jp/menu_kyotsuu/policy/tyosaku.html ）。出典と加工を使い方ページに書いた。加工: 半角カナ → ひらがな、同じ表記で読みが割れる 7 名（南牧村・川西町・広川町・明和町・朝日町・松前町・池田町）は外す、政令市の区は「札幌市中央区」と全国で読みが 1 つの区名、都道府県名は「都・府・県」を外した形も（三重は除く）
- **複合語 103**: 語は自分で選んだ（`tools/compounds-candidates.txt` → `tools/compounds-selected.txt`）。読みは `tools/verify-compounds.py` がデジタル大辞泉（小学館、コトバンク）の見出しで確かめたもの（`tools/compounds-verified.tsv`、出典 URL つき）。辞書の読みが 2 つ以上ある語は点線を残す。辞書に見出しが無い語（授業参観・避難訓練など）は入れない
- 市区町村の合併・改称は年 1 回確認（総務省の表の更新日を見て、新しければ xlsx を取り直して作り直す）

## 学年と常用漢字

`constants.js`: 学年別漢字配当表（gakushu-print の `constants.js` から写し。直すときは両方。`tests/data.test.js` が隣に gakushu-print があれば一致を確かめる）、常用漢字表 2,136 字（文化庁の PDF の本表から取り出し。𠮟 と 叱 は同じ字として扱う）。

## 保守

| 時期 | 確認すること | 直す場所 |
|------|------------|---------|
| 年 1 回（4 月ごろ） | 総務省の団体コード表の更新（合併・改称） | `tools/build-extra-dict.py` を回して `data/extra-dict.json` |
| 解析器の新しい版が出たとき | 精度と大きさ | 上の「解析器と辞書」の更新手順 |
| 学習指導要領の改訂 | 配当表 | `constants.js`（gakushu-print と同時に） |

値や辞書を直したら、`guide.html`・`en/guide.html` の「更新履歴」に日付と内容を 1 行足す。

## テスト

```sh
npm ci                       # Node 版の解析器（lindera-wasm-nodejs-ipadic）を入れる
node --test tests/*.test.js  # 規則・出力・辞書・バックアップ・ブックマークレット
```

## ファイル

| ファイル | 役割 |
|---------|------|
| `index.html` / `en/index.html` | 本体（日本語・英語。同じ JS を読み、文言は `main.js` の `TEXT`） |
| `guide.html` / `en/guide.html` | 使い方・振り方・精度・よくある質問・注意 |
| `print/index.html` | 印刷した紙のクレジットから来た人の着地ページ（noindex、sitemap に載せない） |
| `calc.js` | 規則と出力（純粋関数） |
| `main.js` | 画面の制御・保存・印刷・コピー・直す・ブックマークレットの受け取り |
| `worker.js` | 解析（Web Worker、ES module）。辞書を読み、Cache API に入れる |
| `constants.js` | 配当表・常用漢字・解析器の版・追加辞書の出典 |
| `data/extra-dict.json` | 追加辞書（地名・複合語） |
| `dict/lindera-2.0.0/` | 解析器と辞書（npm から写したもの）とライセンスの表示 |
| `sw.js` / `manifest.webmanifest` | オフライン対応 |
| `tools/` | 追加辞書を作る・確かめる、辞書を写す、精度を測る |
| `tests/*.test.js` | テスト |

## ライセンス

MIT License（`LICENSE`）。同梱する第三者のもの: lindera-wasm（MIT）、IPADIC（`dict/lindera-2.0.0/NOTICE-IPADIC.txt`）、総務省の地方公共団体コードを加工したデータ（公共データ利用規約 第1.0版）。
