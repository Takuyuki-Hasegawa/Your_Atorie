# YOUR ATORIE

信頼している人にだけ、自分の世界観をカードとして渡すための小さなWebアプリです。思想は [docs/philosophy.md](docs/philosophy.md)。

今の試作は **中国旅のトピック型カード** です。次にやりたいことは作成 → QRでその場で渡す、です。アカウント・友達通知・Bluetooth・他のカード型はまだありません。

## 開き方

いまは進め方の **③**（公開URLでアプリを開く）。手順の正は [docs/process.md](docs/process.md) の「③ のやり方」。

```
https://takuyuki-hasegawa.github.io/Your_Atorie/
```

自分のスマホのブラウザで開く。書いたカードはまだこのURLには乗らない。`main` へ push すると GitHub Pages が更新される。

手元の LAN 確認はこれまでどおり。

```powershell
node server.mjs
```

| URL | 画面 |
| --- | --- |
| `/` または `/#` | 受け手画面（表紙 → 手札で選ぶ → 読む） |
| `/#create` | 作成画面 |
| `/?view=1` | 受け手専用。作成ボタンを出さない |

下書きは開いているブラウザに保存されます。別の人へ本当に送る公開URLは、まだ接続していません。

## ドキュメント

仕様や実装を変えたら、コードと一緒にここも更新します。

- [思想](docs/philosophy.md)
- [進め方](docs/process.md)
- [プロダクト仕様](docs/product-spec.md)
- [アーキテクチャ](docs/architecture.md)（①〜⑤でデータをどこに置くか）
