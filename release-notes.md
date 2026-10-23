# Node-RED-BlobStorage Release Notes

## 7.0.0

* Node-RED-Templateの反映(ver7.0.0)

## 6.1.0

* 課題対応
  * Azure Blob Storage on IoT Edgeモジュールを経由してアップロードを推奨に変更
  * エラーレベルログをcatchノードでキャッチできるように修正
  * ノードステータス表示機能を追加
  * アップロード失敗時はその旨のメッセージが出力されるように修正
  * upload-filesノードにおいて、出力blobパスを入力メッセージで指定できるように修正
  * 接続文字列とコンテナー名の設定を必須に修正
* Node-RED-Templateの反映(ver6.1.0)

## 6.0.1

* パイプライン実行環境のvmImageのバージョン変更(20.04→22.04)
* ドキュメント更新

## 1.1.1

* Node-RED-Templateをマージ
  * 格納先Artifactsをビルドの種類(手動/Tag)によって変更
  * 他必要ファイル取り込み
* APIバージョンによるエラー暫定対応
  * SDKのバージョンを12.13.0に固定
* settings.jsの扱い変更による対応
  * upload-settingsノードをupload-flowsノードに変更
  * flows.jsonのみをアップロードするノードに変更

## 1.0.0

* 新規作成
