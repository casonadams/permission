export const BASELINE_TOOL_ALLOW: readonly string[] = [
  // Core built-in tools (file safety enforced by path surface)
  "read",
  "write",
  "edit",
  "ls",
  "grep",
  "find",
  // Workflow & interactive tools
  "skill",
  "todo",
  "ask_user_question",
  "subagent",
  "Agent",
  "get_subagent_result",
];

export const BASELINE_BASH_ALLOW: readonly string[] = [
  // Git read-only inspection
  "git status *",
  "git diff *",
  "git log *",
  "git show *",
  "git rev-parse *",
  "git remote -v*",
  "git remote show *",
  "git check-ignore *",
  "git branch --list *",

  // Filesystem navigation & listing
  "pwd*",
  "ls *",
  "dir *",
  "tree *",
  "stat *",
  "file *",
  "cd *",

  // Search & inspection
  "grep *",
  "egrep *",
  "fgrep *",
  "rg *",
  "ag *",
  "fd *",
  "which *",
  "whereis *",
  "type *",
  "tokei *",
  "cloc *",
  "scc *",

  // File viewing
  "cat *",
  "head *",
  "tail *",
  "wc *",
  "nl *",
  "strings *",

  // Non-mutating filters & formatters
  "sort *",
  "uniq *",
  "cut *",
  "tr *",
  "column *",
  "fold *",
  "fmt *",
  "diff *",
  "cmp *",
  "jq *",
  "awk *",

  // System & environment inspection
  "uname *",
  "whoami*",
  "hostname*",
  "uptime*",
  "date*",
  "cal*",
  "echo *",

  // Version and help queries
  "* --version",
  "* -v",
  "* --help",
  "* -h",
];
