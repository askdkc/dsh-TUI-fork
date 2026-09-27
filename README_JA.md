<p align="center">
  <img src="docs/assets/readme/logo-en.svg" alt="dsh-CLI のピクセルクジラのアニメーションロゴ" width="560">
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README_ZH.md">简体中文</a> | <strong>日本語</strong>
</p>

<p align="center">
  <a href="https://github.com/askdkc/dsh-cli/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/askdkc/dsh-cli/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <img alt="公開ベータ版" src="https://img.shields.io/badge/status-public%20beta-7da1de?style=flat-square">
  <a href="https://github.com/askdkc/dsh-cli/stargazers"><img alt="GitHub スター数" src="https://img.shields.io/github/stars/askdkc/dsh-cli?style=flat-square&color=4b6fff"></a>
</p>

# dsh-cli

> DeepSeek Harness 向けの対話型ターミナル UI プラグインです。ピクセルクジラのヘッダー、
> 作業状況のリアルタイム表示、思考過程のストリーミング表示、Esc 連打による巻き戻し、
> コンテキストの進捗バー、TPS メーターを備えています。DSH 本体の変更は不要です。
> インストールすれば使え、アンインストールしても本体にパッチは残りません。

## 主な機能

- **ピクセルクジラ** — 起動時のアニメーションは 3 種類。クリックで起こせます。最初のタスクが始まると静止します。
- **ターミナル向け UI** — Markdown のストリーミング表示、ツールカード、`/` と `@` の補完、`#L12-14` の行範囲指定、履歴検索、中国語・英語の UI。
- **画像** — Kitty/Sixel のサムネイル、ズームとパンができる中央プレビュー、貼り付け時のサイズ調整、画像表示非対応時のテキスト表示。
- **Mermaid 図** — ````mermaid ```` のコードフェンスを Unicode の図として表示します。
- **タイムライン** — すべてのターンをクリックできます。右端はタイムライン、スクロールバー、非表示から選べます。
- **リアルタイムの状態表示** — 作業アニメーション、コンテキスト使用量、TPS、キャッシュヒット率、推論の強度、token 数、Git とセッションの情報。
- **共通のセッション管理画面** — `/resume` `/home` `/agentview` `/bg` `⌸`。
- **セッション操作** — `/new` `/compact` `/export` `/btw`、モデルの即時切り替え、fork、巻き戻し、vim 操作、全画面の下書きエディター。
- **IDE の選択範囲** — VS Code で選択した内容をプロンプトに送れます。
- **DSH 連携** — preset、skill、MCP、goal、todo、subagent、質問フォーム。
- **プロバイダー認証** — `/auth` で ChatGPT、Claude、Grok、OpenCode Zen/Go、OrcaRouter、OpenRouter、Nous、Infron に接続し、`/model` でモデルを選びます。
- **拡張機能** — ブラウザー操作、computer use など。
- **長いセッションへの対応** — イベントからの画面生成、仮想化、上限付きキャッシュ。

キー操作とコマンドは[操作・コマンド一覧](docs/interaction.en.md)、その他は[ドキュメント索引](docs/README.md)を参照してください。

## 画面プレビュー

<div align="center">
  <picture>
    <source media="(max-width: 640px)" srcset="docs/assets/readme/preview-en-mobile.svg">
    <img src="docs/assets/readme/preview-en.svg" alt="英語 UI の録画：開始画面、補完、ヘルプ、入力、ピクセルクジラのアニメーション。" width="78%">
  </picture>
</div>

## 掲載実績

上流の dsh-TUI プロジェクトは **DeepSeek Harness の公式 WeChat アカウント**で紹介され、プラグイン一覧の
[dshfind](https://dshfind.com/en/plugins/ccch1mneyyy/dsh-TUI) に掲載されました。
また、TypeScript の [GitHub Trending](https://trendshift.io/repositories/146168) 日間ランキングで **7 位**になりました。

<div align="center">
  <table>
    <tr>
      <td align="center" valign="middle" width="50%">
        <img src="screenshots/wechat-official.png" alt="DeepSeek Harness 公式 WeChat アカウントによる dsh-TUI の紹介" width="480">
        <br>
        <strong>公式 WeChat アカウントで紹介</strong>
      </td>
      <td align="center" valign="middle" width="50%">
        <a href="https://dshfind.com/en/plugins/ccch1mneyyy/dsh-TUI"><img src="https://dshfind.com/api/card/ccch1mneyyy/dsh-TUI?lang=en" alt="dshfind に掲載された dsh-TUI" width="420"></a>
        <br>
        <strong>dshfind に掲載</strong>
        <br><br>
        <a href="https://trendshift.io/repositories/146168" title="GitHub Trending 日間 7 位 · TypeScript"><img alt="Trendshift" src="https://trendshift.io/api/badge/trendshift/repositories/146168/daily?language=TypeScript"></a>
        <br>
        <strong>GitHub Trending 日間 7 位</strong>
      </td>
    </tr>
  </table>
</div>

## クイックスタート

事前に [Node.js](https://nodejs.org/en) と
[deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) をインストールし、
`DEEPSEEK_API_KEY` を設定してください。

主な動作確認対象は DSH `0.1.7-rc.2` です。Shell API、V4 セッションメッセージ、
宣言的 preset、profile に保存する設定に対応しています。以前の対応版向けの互換経路も残しています。
詳しくは[設定ガイド](docs/configuration.en.md)を参照してください。

DSH 0.1.7 の `/settings` は、カスタム ID を含む TUI の実際の Loader エントリー ID を使います。
profile の依存関係には `@deepseek-ai/schemastery` 3.18.3 以降が必要です。
schema に互換性がない場合、編集できない設定画面を表示する代わりに、起動時に修復方法を示して停止します。
以前の DSH では従来の設定 scope を使います。

この fork をソースからビルドし、`dsh-cli` profile にインストールします。
Node `^22.19 || >=24` と pnpm 11、依存関係をインストール済みの DeepSeek Harness ソース checkout が必要です。

```sh
git clone --recurse-submodules https://github.com/askdkc/dsh-cli.git
cd dsh-cli
pnpm install --frozen-lockfile
TMPDIR=/tmp pnpm build

node scripts/with-publish-manifest.mjs npm pack --ignore-scripts
TARBALL="$PWD/askdkc-dsh-cli-$(node -p "require('./package.json').version").tgz"

cd ~/DIR/TO/deepseek-harness
pnpm dsh plugin --profile dsh-cli add "$TARBALL"
pnpm dsh --profile dsh-cli
```

`~/DIR/TO/deepseek-harness` を実際の checkout パスに置き換えてください。
tarball 名は現在のパッケージ名 `@askdkc/dsh-cli` とバージョンから決まります。
`dsh-cli` グローバルコマンドも必要なら、pack 後に
`npm install -g --legacy-peer-deps "$TARBALL"` を実行します。
旧コマンド `dsh-tui` と `dst` は互換エイリアスとして残します。
ローカル tarball の更新には再ビルドと再インストールを使い、registry を参照する `/update` は使わないでください。

pnpm ≥11 はインストールスクリプトを含む依存関係に
`ERR_PNPM_IGNORED_BUILDS` を報告する場合があります。ネイティブ依存関係の設定は
[インストールガイド](docs/getting-started.en.md#pnpm-install-script-blocks-and-foreign-platform-natives)を参照してください。
`/update` と `dsh-cli update` は registry から更新します。ローカル fork は tarball を再ビルドして再インストールしてください。

### CLI

| コマンド | 用途 |
| --- | --- |
| `dsh-cli` / `dst` | TUI を起動します。`dst` は同じプログラムの短い別名です。 |
| `dsh-cli --resume [id]` · `dsh-cli update` · `dsh-cli doctor` | セッションの再開 · registry からの更新 · 起動前の環境確認 |
| `dsh-cli safe` | 読み取り専用の診断、プラグイン一覧、修復案内。`safe --rescue` は空の救済用 profile を作成します。 |
| `dsh-cli version` · `dsh-cli help` | ランチャーと profile のバージョン、使い方。`dsh` 未インストールでも実行できます。 |

その他の引数は `dsh --profile dsh-cli` に渡されます。安全モードについては
[インストールガイド](docs/getting-started.en.md)を参照してください。

### 他のエージェントから会話を取り込む（`dsh-cli migrate`）

Claude Code、Codex、OMP、zcode、Grok Build の会話履歴を DSH のセッションストアに取り込みます。
取り込み後は、元の作業ディレクトリから `/resume` で会話を探して再開できます。

```sh
dsh-cli migrate                  # エージェント別の取り込み可能件数を表示（書き込みなし）
dsh-cli migrate claude-code      # Claude Code の会話をすべて取り込む（codex / omp / zcode / grok-build も指定可）
dsh-cli migrate codex --dry-run  # 取り込み内容を確認（書き込みなし）
```

- **元データは読み取り専用**：他のエージェントのローカル保存領域は読み取るだけです。取り込んだデータは公式の `JsonlSessionPersistence` 経由で保存するため、通常のセッションとして開き、会話を続けられます。
- **重複を防止**：元の会話ごとに決まった UUID を使い、再取り込み時は既存の会話を飛ばします。
- **会話の構造を保持**：ユーザーとアシスタントのメッセージ、推論の記録をターンごとに再構成します。ツールの通信は忠実に再生できないため移行しません。過去の会話を読むための機能であり、過去のタスクを実行途中から再開する機能ではありません。

TUI 内では `/migrate` または `/migrate <agent> [--dry-run]` を実行します。子プロセスで取り込み、結果は通知に表示します。
通常のシェルから `dsh-cli migrate ...` を実行しても同じ機能を使えます。
詳しくは[セッション移行ガイド](docs/migrate.en.md)を参照してください。

- pi、opencode などは、adapter が追加されると取り込み対象になります。grok-build は `GROK_HOME` が設定されていれば参照します。

**VS Code**：統合ターミナル、または `dsh-tui-vscode` 拡張機能を使えます。[VS Code ガイド](docs/vscode.en.md)を参照してください。
**Herdr**：[Herdr](https://herdr.dev) のペインで `dsh-cli` を実行すると、ローカル連携 API を通して `idle` / `working` / `blocked` を報告します。

## キー操作とマウス

`Enter` 送信 · `Tab` 補完 · `Ctrl+Enter` 中断して送信 · `Alt+Up` 前のメッセージを呼び出す · `Esc` 閉じる、2 回押すと巻き戻す · `Ctrl+O` 詳細 · `Ctrl+R` 履歴 · `Ctrl+V` 貼り付け · `Ctrl+Shift+E` 全画面の下書きエディター · `?` ショートカット · `←` セッションをバックグラウンドへ。

モデルの応答中は、`Enter` で指示を追加し、`Tab` で次の指示をキューに入れ、`Ctrl+Enter` で中断して送信します。

全画面では、マウスでドラッグして選択・コピーできます。ダブルクリックとトリプルクリックで単語・行を選択し、ツールカード、タイムラインの目盛り、`[Image #N]` のプレビューもクリックできます。

詳しくは[操作・コマンド一覧](docs/interaction.en.md)を参照してください。

## 組み込みコマンド

`/resume` · `/home` · `/agentview` · `/bg` · `⌸` は共通のセッション管理画面を開きます。ここには作業領域一覧、実行状況、フィルター、★ のピン留めがあります。そのほか、`/model` `/new` `/compact` `/export` `/btw` `/tree` `/fork` `/rewind` `/settings` `/status` `/cost` `/jobs` `/skills` `/mcp` `/login` `/update` を使えます。

セッション管理画面には前回読み込みに成功した一覧がすぐに表示され、並行して保存領域の変更を確認します。ログの詳しい走査が必要なタイトルは仮の名前で表示し、復元後に同じ行を更新します。

**バックグラウンドのセッション**：`/bg`、または入力欄が空のときに `←` を押します。`Esc` で戻れます。同じプロセス内で動き、TUI を終了すると停止します。ログは残ります。

コマンドの一覧は[操作・コマンド一覧](docs/interaction.en.md)を参照してください。

## 設定と拡張

Agent preset、テーマ、MCP サーバー、環境変数については[設定ガイド](docs/configuration.en.md)と[テーマガイド](docs/themes.en.md)を参照してください。

## 仕組み

```text
dsh profile → dsh-base → dsh-cli Cordis patch → agent preset + DSH services
  → session/event → Channel projection → React components → Ink/Yoga renderer → terminal
```

TUI が担うのは操作と表示です。セッションログが唯一の事実源で、モデル、ツール、永続化は DSH のサービスが管理します。長いセッションでも、描画コストは表示中の範囲に比例します。

実行経路、モジュールの境界、性能、保存先は[アーキテクチャと制限](docs/architecture.en.md)を参照してください。

## 既知の制限

- 注入されたプラグインのコンテキストは独立した項目としては表示されず、コンテキストの内訳に含まれます。
- `/model` はセッションを fork してモデルを切り替えます。元のセッションは `/resume` に残ります。
- `Ctrl+V` にはプラットフォームのクリップボードツールが必要です。非対応の画像形式は拒否されます。
- バックグラウンドのセッションはこのプロセス内で動き、TUI の終了時に停止します。
- `/thinking` は保存されません。`minimal` preset では `/compact` を使えません。`/update` は `dsh --profile` からの起動が必要で、ターンの実行中は拒否されます。

詳しくは[アーキテクチャと制限 → 既知の制限](docs/architecture.en.md#known-limitations)を参照してください。

## ソースからビルドする

CI は Node 24 と pnpm 11 を使います。対応する Node は `^22.19 || >=24` です。
submodule を初期化した checkout で実行してください。`vendor/dsh-std` または
`dsh-auth` が空なら `git submodule update --init --recursive` で初期化します。

[クイックスタート](#クイックスタート)に clone からインストールまでのコマンドをまとめています。
ソースを変更した場合、pack 前に変更範囲に応じた確認を実行してください。

```sh
cd ~/DIR/TO/dsh-cli
pnpm smoke
pnpm verify:package
```

`with-publish-manifest.mjs` は同梱するローカル依存関係用の manifest を一時的に作り、
pack の終了後に元へ戻します。tarball は `dsh-cli` profile にのみインストールされ、npm には公開されません。
既存の checkout で submodule が足りない場合は、依存関係のインストール前に
`git submodule update --init --recursive` を実行してください。
**Git URL からのパッケージインストールには対応していません。** ソースの manifest には
workspace とローカルのリンクがあるため、先にビルドして pack する必要があります。

### バージョンを上げる

tarball を作る前に、dsh-cli の checkout で SemVer を更新します。以下の `0.11.3` は例です。実際に付けるバージョンに置き換えてください。

```sh
cd ~/DIR/TO/dsh-cli
npm pkg set version=0.11.3
pnpm install --lockfile-only --ignore-scripts
git diff -- package.json pnpm-lock.yaml
```

`dsh-auth` を変更した場合は、そちらの `package.json` と lockfile も独立して更新し、新しい submodule の commit をこのリポジトリに記録してからリリースしてください。そうしなければ、クリーンな checkout では古い submodule のままビルドされます。
続けて上記の手順でビルド・pack し、tarball のファイル名が `package.json` のバージョンと一致することを確認します。
公開は別の操作です。dsh-cli のパッケージバージョンと完全に一致する `vX.Y.Z` tag を push したときだけ、公開 workflow が動きます。

## プラグインエコシステム

プラグイン開発：[受け入れ・開発ガイド](https://github.com/T-Auto/dsh-ecosystem-spec/blob/main/docs/plugin-admission-and-development.md) · [plugin-template](https://github.com/dsh-tui-ecosystem/plugin-template) · [dsh-tui-ecosystem](https://github.com/dsh-tui-ecosystem)。実装例：`dsh-working-activity`。

拡張ポイントの安定度と API については[プラグイン開発](docs/plugins.en.md)を参照してください。エコシステムの管理組織は掲載先を管理しますが、コミュニティ製プラグインを保証するものではありません。

## ドキュメント

- **導入** — [インストール](docs/getting-started.en.md) · [VS Code](docs/vscode.en.md)
- **操作** — [キー操作とコマンド](docs/interaction.en.md) · [ユーザーガイド](docs/user-guide.en.md) · [テーマ](docs/themes.en.md)
- **設定** — [設定リファレンス](docs/configuration.en.md)
- **実装** — [アーキテクチャと制限](docs/architecture.en.md) · [セッションのマウント](docs/session-mount-runtime.en.md)
- **プラグイン** — [受け入れ・開発ガイド](https://github.com/T-Auto/dsh-ecosystem-spec/blob/main/docs/plugin-admission-and-development.md) · [拡張ポイント](docs/plugins.en.md)
- **参加** — [コントリビューションガイド](docs/contributing.en.md) · [ロードマップ](docs/roadmap.en.md) · [コミュニティ](docs/community-management.en.md)

英語・中国語の全ドキュメントは[ドキュメント索引](docs/README.md)にあります。

## コミュニティ

- **エコシステムの管理組織**：[dsh-tui-ecosystem](https://github.com/dsh-tui-ecosystem) にコミュニティ製プラグイン、テンプレート、一覧があります。プラグインやアイデアも歓迎します 🐋
- **チャットグループ**（中国語）：使い方の質問、プラグインのアイデア、機能の要望を受け付けています。
- **行動規範**：参加前に [Contributor Covenant 行動規範](CODE_OF_CONDUCT.en.md)を確認してください。

| WeChat グループ（dsh-TUI コミュニティ 4） | QQ グループ（ID 572549239） |
| :---: | :---: |
| <img src="screenshots/wechat-group.jpg" alt="dsh-TUI コミュニティの WeChat グループ 4 の QR コード" width="200"> | <img src="screenshots/qq-group.png" alt="dsh-TUI コミュニティの QQ グループの QR コード" width="200"> |

> WeChat の QR コードは約 7 日で期限切れになります。使えない場合は QQ グループ（572549239）を利用するか、issue で更新を知らせてください。

## 権限とセキュリティの境界

> **Windows のセキュリティ上の注意**：Windows profile は既定で `danger-full-access`、承認は `never` です。ツールは制限なしでアクセスできます。機密情報を含む環境や信頼できないリポジトリで使う前に、profile を確認して権限を絞ってください。

dsh-cli 独自の sandbox はありません。実行中の DSH profile のファイルシステム、Shell、sandbox、承認ポリシーを使います。権限 preset は DSH の `permissionPresets` registry から取得します。

詳しくは[権限とセキュリティの境界](docs/architecture.en.md#permissions-and-security-boundary)を参照してください。

## 謝辞

- ピクセルクジラの手描き 22 フレームと待機中の動作は、**[dsh-ui-whale](https://github.com/lhh010/dsh-ui-whale)** から移植しました。原画は Excel 上で 1 マスずつ描かれています。待機中にはヒレや尾を動かし、眠ると Z が浮かび、クリックするとハートが現れます。dsh-ui-whale は [@lhh010](https://github.com/lhh010) による DeepSeek Harness Web 向けのクジラのペットプラグインで、ライセンスは BSD-3-Clause です。作品と着想をありがとうございます 🐋💜

## 関連リンク

友人が作ったコミュニティや関連プロジェクト、連携ツールは[リンク集](docs/links.md)を参照してください。

## スター履歴

[![Star History](https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/bot-star-history/assets/star-history/star-history.png)](https://star-history.com/#ccch1mneyyy/dsh-TUI&Date)

## ライセンス

[MIT](LICENSE)
