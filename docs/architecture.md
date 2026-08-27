# アーキテクチャ

最終更新: 2026-08-27

## 形

フロントだけの静的サイト。フレームワークもビルドもバックエンドもない。

```
index.html  　#app に全部描く
app.js       状態、保存、画面
styles.css   受け手（.phone）と作成者（.creator）と渡す（.pass）
qr.js        QRのSVG。依存追加なし
server.mjs   ②のコピー機と、④で箱へ置く窓口
trips/       渡したカードのJSON
media/       渡した写真・動画
```

依存は Google Fonts だけ（Outfit / Noto Serif JP / Playfair Display / DM Mono）。QRは自前の `qr.js`。

確認の段階は [process.md](./process.md)。いまは⑤。保存を段階ごとにどこへ置くかは、下の「保存の計画」が正。

## 画面の切り替え


| 条件                            | 画面                 |
| ----------------------------- | ------------------ |
| `location.hash === '#create'` | 作成画面（入力）           |
| `location.hash === '#pass'`   | QR（渡す瞬間）           |
| それ以外                          | 受け手画面（出力）          |
| `?view=1`                     | 受け手画面。作成ボタンなし      |
| `?c={id}`                     | 箱から読んだ受け手画面。作成ボタンなし |


受け手の中は JS 変数 `page` で動く。

```
cover → list → picker → open
```

`list` はトピックの手札。`picker` は `activeCard` の中のカードの手札。どちらも手前のカードにコメントが見え、右下にずらして重ねる。見えているカードを押すとそのカードが手前に来る。手前を押すと選ぶ。ずらしてもめくれる。円型の扇にはしない。`open` は選んだ葉を一枚だけ見る。隣へは送らない。`activeLeaf` で開いた葉を決める。この内側の位置は URL に出さない。

## データ

渡す一枚 `trip` の中にカードが並ぶ。カードは一枚（葉）か束。束の中は葉だけ。この形は①から⑤まで変えない。変わるのは、それを置く場所だけ。

```text
trip
  author
  title
  intro
  cards[]
    id
    title
    overview
    text
    media / mediaId / mediaName / mediaType
    cards[]          あれば束。中は同じ形だが cards は空
```

旧データ `topics[]` と `kind` / `body` / `name` は `normalizeTrip()` がこの形へ移す。`author` が無ければ `takuyuki hasegawa`。下書きでは `旅で感じたこと` が無ければ足す。箱から読むときは足さない。

## 保存の計画（①〜⑤）

開き方が違うと、ブラウザは別の箱として扱う。消えたように見えても、別のURLの箱を見ていることが多い。


| 開き方の例                                                | いまの箱                     |
| ---------------------------------------------------- | ------------------------ |
| `file:///C:/Users/takuy/code/Your_Atorie/index.html` | このファイル専用。①で書いていた本体はここ    |
| `http://127.0.0.1:4180/`                             | 4180 専用。空の別箱             |
| `http://192.168.x.x:4180/`                           | スマホのブラウザ。②ではサーバー上のコピーを読む |
| `https://takuyuki-hasegawa.github.io/Your_Atorie/`   | アプリの箱。`?c=` が無いと下書きは空    |
| `https://…/Your_Atorie/?c={id}`                      | ④の受け取り。`trips/{id}.json` |


### ① PC上で確認

入力も出力も、**開いているそのURLのブラウザの中**。

```
文章・構造  → localStorage     key: your-atorie-china-v2
写真・動画  → IndexedDB        db: your-atorie-china-media / store: media
```

ディスクにもクラウドにもまだ置かない。`file://` で開いて書いたものは、同じブラウザで同じ `file://` を開けば残っている。`http://127.0.0.1:4180/` を開いても、そこには移らない。

写真を Data URL にして `localStorage` に入れると容量を超える。だからファイル本体は IndexedDB、メタデータだけ JSON に残す。起動時 `hydrateMedia()` が `mediaId` から Blob を読み、`URL.createObjectURL` で再表示する。

### ② スマホ上で確認

入力は①の箱のまま。出力だけスマホで触る。他人には届かない。

```
PCで「スマホへ」
  → POST /debug-draft
  → このPCの debug-draft.json（git に載せない）

スマホで phone URL を開く
  → GET /debug-draft.json
  → スマホの IndexedDB に一時コピー
  → 受け手画面（出力）
```

`server.mjs` は LAN のコピー機。本番の公開ではない。手元の手順は [process.md](./process.md) の「② のやり方」。

### ③ web上にリリース

アプリのファイルを HTTPS の公開オリジンに置く。GitHub Pages。`main` への push で Actions が配信する。

```
アプリ本体     → https://takuyuki-hasegawa.github.io/Your_Atorie/
入力の下書き   → まだ作成者のブラウザ（①と同じ localStorage / IndexedDB）
```

③は「自分のスマホからアプリのURLを開ける」まで。カード一式がネットに乗るのは④。公開オリジンでは②の「スマホへ」を出さない。

### ④ QRで他人が読める

会っている相手がカメラで読む。そのQRの先で、②と同じ出力が見える必要がある。だからここで初めて、カードをブラウザの外に出す。

箱は同じ GitHub Pages。ブラウザは Pages に直接置けないので、PCの `server.mjs` が窓口になる。

```
PCの作成画面で「渡す」
  → POST http://127.0.0.1:4180/publish   （loopback だけ）
  → 同じ id を使い回す（trips/.current-id）
  → trips/{id}.json
  → media/{id}/…
  → git add / 変わっていれば commit / push（この二箇所だけ）
  → 箱にあれば QR（すでに載っていても出す）
公開URL
  https://takuyuki-hasegawa.github.io/Your_Atorie/?c={id}
QR
  そのURL。作成画面の次に出す
受け手
  GET ./trips/{id}.json
  media は JSON に書いた相対URL
  下書きの localStorage は上書きしない
```

作成の流れは `書く → この箱に置く → QRを画面に出す`。QRに載せるのはURLだけ。チャットに貼って遠隔配信するのが主目的ではない。

アカウントはまだ作らない。URLを持っている人が見られる。リポジトリは public なので、`trips/` は GitHub 上で列挙できる。信頼の輪の外に出さない、は運用で守る。id を広告しない。

`?c=` を開いているときは `publishedMode`。`save()` しない。

### ⑤ QRの先が②と同じ（いま）

④のURLを開いた受け手画面は、②で触った出力と同じであること。

```
②  debug-draft.json を読む
⑤  trips/{id}.json と media を読む
画面  cover → 手札 → 開く。同じ
```

データ源だけが違う。画面を⑤用に作り直さない。②で足りない操作は、⑤の前に②で直す。

## 描画

`innerHTML` で画面を作り直す。作成画面の入力のたびにプレビューを描き直す。XSS 対策として表示文字列は `esc()` する。メディア URL は自分で作った blob URL、または④の `./media/{id}/…` を `src` に使う。

選ぶ画面は手札。カードは右下にずらして重ねる。見えている裏を押すとそのカードが手前へ滑る。手前を押して選ぶ。ずらしてもめくれる。下に払うと一段戻る（開いたカード → 手札 → 表紙）。写真は写真面から下へ。文章はスクロール先頭で下へ。手札の写真はカード型に切り抜く。開いた写真は上に全体を載せ、文章をすぐ下に置く。カードの縁の光で画面と分ける。開いたあとはその一枚だけ。画像のネイティブドラッグは無効。動画は開いたカードの再生ボタンで再生する。表紙と手札の動画は無音ループ。

渡す画面は暗い。QRが大きく、その下にURL。説明文は足さない。

## 公開の現状

「渡す」は次をする。

1. いまの下書きを pack する（写真は Data URL）
2. `127.0.0.1:4180/publish` へ送る
3. `trips/{id}.json` と `media/{id}/` を書いて、変わっていれば push する。同じ id なら上書き
4. 箱にあれば QR を出す。送れなければ QR は出さない

公開オリジンの「スマホへ」は出さない。`node server.mjs` が②と④の窓口。

## 次の実装で足すもの

いまは⑤。思想上の次は人（アカウント）とカードの紐づき。画面を⑤用に作り直さない。

アカウント、友達通知、Bluetooth、他のカード型は、このあと。いいねとカード単位コメントも、渡せるようになってから。
