# YOUR ATORIE

信頼している人にだけ、自分の世界観をカードとして渡すための小さなWebアプリです。思想は [docs/philosophy.md](docs/philosophy.md)。

今の試作は **中国旅のトピック型カード** です。いまは QR の先で、②と同じ受け手画面が見える、まで。アカウント・友達通知・Bluetooth・他のカード型はまだありません。

## 開き方

いまは進め方の **⑤**（QRの先が②と同じ）。手順の正は [docs/process.md](docs/process.md) の「⑤ の確認」。

受け取り（QRの先）:

```
https://takuyuki-hasegawa.github.io/Your_Atorie/?c={id}
```

渡すときは、写真が見えているPCのタブ（多くの場合 `file://…#create`）で `node server.mjs` を起動して **渡す** を押す。公開URLを開いただけでは、①で書いた写真は乗らない。

手元の LAN 確認はこれまでどおり。

```powershell
node server.mjs
```

| URL | 画面 |
| --- | --- |
| `/` または `/#` | 受け手画面（表紙 → 手札で選ぶ → 読む） |
| `/#create` | 作成画面 |
| `/#pass` | QR |
| `/?view=1` | 受け手専用。作成ボタンを出さない |
| `/?c={id}` | 箱から読んだ受け手画面。作成ボタンを出さない |

下書きは開いているブラウザに保存されます。渡したカードは `trips/{id}.json` と `media/{id}/` に置きます。

## ドキュメント

仕様や実装を変えたら、コードと一緒にここも更新します。

- [思想](docs/philosophy.md)
- [進め方](docs/process.md)
- [プロダクト仕様](docs/product-spec.md)
- [アーキテクチャ](docs/architecture.md)（①〜⑤でデータをどこに置くか）
