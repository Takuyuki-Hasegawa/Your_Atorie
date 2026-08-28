# アーキテクチャ

最終更新: 2026-08-28

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
cover → deck → open
         └── deck   束を選んだとき
```

直下が葉一枚なら `cover → open`。タイトル直下が複数ならタイトルが `deck`。カードの下にカードがあればそのカードが `deck`。

`deck` は手札。手前のカードにコメントが見え、右下にずらして重ねる。見えているカードを押すとそのカードが手前に来る。手前を押すと選ぶ。ずらしてもめくれる。円型の扇にはしない。葉なら `open`。束なら中の `deck`。`open` は選んだ葉を一枚だけ見る。隣へは送らない。`activeDeck` が今のデッキ（空ならタイトル）、`activeLeaf` が開いた葉。この内側の位置は URL に出さない。写真のないカードと表紙は羊皮紙。文章だけの特別ルートは無い。

## データ

渡す一枚 `trip` の中にカードが並ぶ。カードは一枚（葉）か束。束の中は葉だけ。この形は①から⑤まで変えない。変わるのは、それを置く場所だけ。

```text
trip                 渡す一枚。人の下に複数ある
  id
  author
  title          { ja, en }  旧データは文字列。normalize がこの形へ
  intro          { ja, en }
  cards[]
    id
    title        { ja, en }
    overview     { ja, en }
    text         { ja, en }
    media / mediaId / mediaName / mediaType
    cards[]          あれば束。中は同じ形だが cards は空
```

下書きはカードごと。`localStorage` の `your-atorie-atelier-v1` に id の一覧、`your-atorie-card-{id}` に本体。旧キー `your-atorie-china-v2` は最初の一枚へ移す。中国旅の雛形にだけ `旅で感じたこと` を足す。箱から読むときは足さない。

旧データ `topics[]` と `kind` / `body` / `name` は `normalizeTrip()` がこの形へ移す。文章が文字列なら `{ ja: その文, en: '' }`。`author` が無ければ `takuyuki hasegawa`。英語が空のときは表示が日本語に戻る。

言語は右上の JA | EN。表示と、作成画面の打ち込み先が切り替わる。UI文言は `ui`。本文は作者が両方書く。翻訳はまだしない。選びは `localStorage` の `your-atorie-lang`。無ければブラウザ言語。

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
文章・構造  → localStorage
                your-atorie-atelier-v1     持っているカードの id
                your-atorie-card-{id}      渡す一枚の下書き
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

アプリのファイルを HTTPS の公開オリジンに置く。GitHub Pages。`main` への push で Actions が配信する。テスト中は public。友人が本格的に作るときはサーバーへ移す。

```
アプリ本体     → https://takuyuki-hasegawa.github.io/Your_Atorie/
入力の下書き   → まだ作成者のブラウザ（①と同じ localStorage / IndexedDB）
```

③は「自分のスマホからアプリのURLを開ける」まで。カード一式がネットに乗るのは④。公開オリジンでは②の「スマホへ」を出さない。

### ④ QRで他人が読める

会っている相手がカメラで読む。そのQRの先で、②と同じ出力が見える必要がある。だからここで初めて、カードをブラウザの外に出す。

箱は GitHub Pages。ブラウザは Pages に直接置けないので、PCの `server.mjs` が窓口になる。同じWi-Fiである必要はない。

```
PCの作成画面で「渡す」
  → POST http://127.0.0.1:4180/publish   （loopback だけ）
  → そのカードの id（trip.id）。二枚目は別 id
  → trips/{id}.json
  → media/{id}/…
  → git add / 変わっていれば commit / push（このカードの二箇所だけ）
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

受け手の画面は一枚のまま。人の下にカードが複数あるのは、別の `?c=` が増えるだけ。作成の棚はまだ作らない。切替は作成画面の「新しいカード」だけ。

`?c=` を開いているときは `publishedMode`。`save()` しない。

### ⑤ QRの先が②と同じ（いま）

④のURLを開いた受け手画面は、②で触った出力と同じであること。

```
②  debug-draft.json を読む
⑤  trips/{id}.json と media を読む
画面  表紙から。デッキなら手札、葉一枚なら本文。同じ受け手。
```

データ源だけが違う。画面を⑤用に作り直さない。②で足りない操作は、⑤の前に②で直す。

## 描画

`innerHTML` で画面を作り直す。作成画面の入力のたびにプレビューを描き直す。XSS 対策として表示文字列は `esc()` する。メディア URL は自分で作った blob URL、または④の `./media/{id}/…` を `src` に使う。

選ぶ画面はデッキの手札。カードは右下にずらして重ねる。見えている裏を押すとそのカードが手前へ滑る。手前を押して選ぶ。ずらしてもめくれる。下に払うと一段戻る（開いたカード → デッキ → 表紙）。タイトル直下が複数ならタイトルがデッキ。束を選ぶとそのデッキ。直下が葉一枚なら表紙の次が本文。写真は写真面から下へ。文章はスクロール先頭で下へ。手札の写真はカード型に切り抜く。開いた写真は上に全体を載せ、文章をすぐ下に置く。カードの縁の光で画面と分ける。開いたあとはその一枚だけ。画像のネイティブドラッグは無効。動画は開いたカードの再生ボタンで再生する。表紙と手札の動画は無音ループ。写真のないカードと表紙は羊皮紙。

渡す画面は暗い。QRが大きく、その下にURL。説明文は足さない。

## 公開の現状

「渡す」は次をする。

1. いまの下書きを pack する。写真は長い辺 1600px・JPEG 程度に収めてから Data URL にする。動画は今はそのまま
2. `127.0.0.1:4180/publish` へ送る
3. `trips/{id}.json` と `media/{id}/` を書いて、変わっていれば push する。カードごとに id。同じカードなら上書き
4. 箱にあれば QR を出す。送れなければ QR は出さない

公開オリジンの「スマホへ」は出さない。`node server.mjs` が②と④の窓口。

## 次の実装で足すもの

受け手の画面は変えない。作成の棚とフォローは、友人が本格的に作るときにサーバーと一緒。いいねとカード単位コメントも、渡せるようになってから。
