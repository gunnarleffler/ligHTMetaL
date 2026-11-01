/** Windows cmd.exe batch lexical starter; not an expansion/execution emulator. */
const expansions = () => [
  { id: 'for-variable', pattern: /%%(?:~[A-Za-z]*\$[A-Za-z_]+:|~[A-Za-z]*)?[A-Za-z]/, kind: 'variable' },
  { id: 'environment', pattern: /%~[A-Za-z]*[0-9]|%[0-9*]|%[A-Za-z_][^%\r\n]*%|![^!\r\n]+!/, kind: 'variable' },
];
export default { id: 'batch', aliases: ['bat', 'cmd'], rules: [
  { id: 'comment', pattern: /^[ \t]*@?(?:rem(?=[ \t.]|$)|::)[^\r\n]*/im, kind: 'comment' },
  { id: 'label', pattern: /^[ \t]*:[^:\r\n][^\r\n]*/m, kind: 'function' },
  { id: 'escape', pattern: /\^(?:\r\n|[^])/, kind: 'string' },
  { id: 'quote', begin: /"/, end: /"|(?=\r|\n)/, kind: 'string', rules: expansions() },
  ...expansions(),
  { id: 'command', pattern: /\b(?:assoc|break|call|cd|chdir|cls|color|copy|date|del|dir|echo|endlocal|erase|exit|for|ftype|goto|if|md|mkdir|mklink|move|path|pause|popd|prompt|pushd|rd|rem|ren|rename|rmdir|set|setlocal|shift|start|time|title|type|ver|verify|vol|else|in|do|not|exist|defined|errorlevel|equ|neq|lss|leq|gtr|geq)\b/i, kind: 'keyword' },
  { id: 'operator', pattern: /&&|\|\||[&|<>]=?|[()@]/, kind: 'operator' },
] };
