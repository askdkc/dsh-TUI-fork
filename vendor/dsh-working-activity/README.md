# dsh-working-activity input-language fork

This local fork starts from `dsh-working-activity` 0.5.0 (BSD-3-Clause).
It adds Japanese progress copy and a per-session `lang: input` mode. The original
`auto`, `zh`, and `en` modes retain their behavior.

The dsh-cli workspace links this package locally while its published manifest
names `@askdkc/dsh-working-activity@0.5.0-input.0`. Build with
`npm run build:working-activity` from the dsh-cli root before packing either
package. The fork package must be published before an external dsh-cli
installation can resolve that public alias; no publication is part of this
change.

`client-snapshot/` is the unchanged 0.5.0 Web client bundle and declarations.
The build copies it into `lib/` after compiling the server side, so a fresh
checkout still has the existing optional Web entry. This change targets the
TUI; Web client language-aware ticking is not expanded here.
