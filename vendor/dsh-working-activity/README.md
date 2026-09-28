# dsh-working-activity input-language fork

This local fork starts from `dsh-working-activity` 0.5.0 (BSD-3-Clause).
It adds Japanese progress copy and a per-session `lang: input` mode. The original
`auto`, `zh`, and `en` modes retain their behavior.

The dsh-cli workspace links this package locally; its source manifest names
`@askdkc/dsh-working-activity@0.5.0-input.0` through an npm alias. Build with
`npm run build:working-activity` from the dsh-cli root. The publish-manifest
helper bundles the compiled fork under the runtime dependency name, so an
external dsh-cli installation does not need a separate fork release.

`client-snapshot/` is the unchanged 0.5.0 Web client bundle and declarations.
The build copies it into `lib/` after compiling the server side, so a fresh
checkout still has the existing optional Web entry. This change targets the
TUI; Web client language-aware ticking is not expanded here.
