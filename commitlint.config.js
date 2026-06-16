/**
 * Commitlint configuration — enforces Conventional Commits (CONVENTIONS.md §2).
 * Run via the Lefthook `commit-msg` hook.
 *
 * @type {import("@commitlint/types").UserConfig}
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Restrict scopes to the set declared in CONVENTIONS.md §2.
    "scope-enum": [
      2,
      "always",
      [
        "web",
        "api",
        "db",
        "auth",
        "orders",
        "boxes",
        "shifts",
        "pricing",
        "stats",
        "tenancy",
        "i18n",
        "shared",
        "ci",
        "repo",
        "docs",
      ],
    ],
  },
};
