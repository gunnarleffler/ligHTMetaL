import { quoted } from './shared/starter.js';
/** Dockerfile lexical starter. RUN/COPY arguments are not executed or shell parsed. */
export default { id: 'dockerfile', aliases: ['docker'], rules: [
  { id: 'directive-comment', pattern: /^[ \t]*#[ \t]*(?:syntax|escape|check)[ \t]*=[^\r\n]*/im, kind: 'keyword' },
  { id: 'comment', pattern: /^[ \t]*#[^\r\n]*/m, kind: 'comment' },
  { id: 'instruction', pattern: /^[ \t]*(FROM|RUN|CMD|LABEL|MAINTAINER|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)(?=[ \t]|$)/im, kind: 'keyword' },
  { id: 'flag', pattern: /--[A-Za-z][\w-]*(?:=[^\s"']+)?/, kind: 'attribute' },
  quoted('double', '"'), quoted('single', "'", { escape: false }),
  { id: 'variable', pattern: /\$(?:\{[^}\r\n]*\}|[A-Za-z_]\w*)/, kind: 'variable' },
  { id: 'continuation', pattern: /\\\r?\n/, kind: 'punctuation' },
  { id: 'punctuation', pattern: /[\[\],]/, kind: 'punctuation' },
] };
