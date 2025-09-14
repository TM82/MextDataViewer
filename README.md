# MextDataViewer

このリポジトリは **/docs** を公開ディレクトリにする前提です。データは **/docs/data** に配置し、
アプリからは **相対パス（`data/index.json`）** で読み込みます。

## 構成
```
<repo-root>/
  README.md
  /docs/
    index.html
    app.js
    style.css
    .nojekyll
    /data/
      index.json
      /NISTEP_日英独ベンチマーキング2023/
        日本_参考資料4-1.csv
```

## ローカル確認
```bash
python3 -m http.server 8000
# → http://localhost:8000/docs/
```

## GitHub Pages
- Settings → Pages → Source: **Deploy from a branch**
- Branch: **main** / Folder: **/docs**
- 公開URL例: https://<YOUR-USER>.github.io/<REPO>/

## データの追加方法
1. CSVを `/docs/data/<あなたのフォルダ>/` に置く（区切りはカンマ or タブ / UTF-8 推奨）
2. `/docs/data/index.json` の `datasets` に追記:
```jsonc
{
  "folder": "あなたの統計名",
  "files": [
    { "title": "表示名", "path": "data/あなたの統計名/xxx.csv" }
  ]
}
```
保存して公開すればUI上のフォルダ／ファイルに反映されます。
