/**
 * Re-export of the `@askdkc/dsh-auth` plugin under this
 * package's own name, so the bundle patch layer can mount the auth row as
 * `dsh-cli/oauth` instead of the bare package name —
 * the same anchor the working-activity row uses (#60): the dsh Loader
 * resolves row names from the *profile* directory, where only the profile's
 * direct dependencies are linked, and pnpm's isolated layout never hoists a
 * transitive dependency there. Mounting through this subpath keeps plugin
 * resolution anchored at dsh-cli itself, always a
 * direct profile dependency, under every package-manager layout.
 *
 * @module dsh-cli/oauth
 */
export * from '@askdkc/dsh-auth'
