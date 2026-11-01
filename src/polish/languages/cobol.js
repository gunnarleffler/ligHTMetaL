import { starter, quoted } from './shared/starter.js';
/** COBOL lexical starter; free-form + common fixed-format comment lines, not a
 * complete source-column/continuation or COPY preprocessor implementation. */
export default starter({
  id: 'cobol', aliases: ['cob'], insensitive: true,
  comments: [{ id: 'fixed-comment', pattern: /^[\d ]{6}[*\/][^\r\n]*/m, kind: 'comment' }, { id: 'comment', pattern: /\*>[^\r\n]*/, kind: 'comment' }],
  strings: [quoted('single', "'", { doubled: true, escape: false }), quoted('double', '"', { doubled: true, escape: false })],
  before: [{ id: 'picture', pattern: /\b(PIC(?:TURE)?)(\s+(?:IS\s+)?[ASX9Z0BVP+*,.()\/-]+)/i, kind: 'plain', captures: { 1: 'keyword', 2: 'type' } }],
  keywords: 'ACCEPT ADD ALTER AND ASCENDING ASSIGN AT BY CALL CANCEL CLOSE COMPUTE CONFIGURATION CONTINUE COPY DATA DECLARATIVES DELETE DEPENDING DESCENDING DISPLAY DIVIDE DIVISION ELSE END END-ADD END-CALL END-COMPUTE END-EVALUATE END-IF END-PERFORM END-READ END-SEARCH END-STRING END-WRITE ENVIRONMENT EVALUATE EXIT FD FILE FILE-CONTROL FROM GIVING GO GOBACK IDENTIFICATION IF IN INDEXED INITIALIZE INPUT INPUT-OUTPUT INSPECT INTO IS LINKAGE MOVE MULTIPLY NOT OCCURS OF OPEN OR ORGANIZATION OUTPUT PERFORM PROCEDURE PROGRAM-ID READ REDEFINES RENAMES REPLACING RETURN REWRITE SEARCH SECTION SELECT SORT START STOP STRING SUBTRACT THEN THRU TIMES TO UNSTRING UNTIL USING VALUE VALUES VARYING WHEN WITH WORKING-STORAGE WRITE',
  constants: 'SPACE SPACES ZERO ZEROS ZEROES HIGH-VALUES LOW-VALUES',
  after: [{ id: 'hyphen-name', pattern: /[A-Za-z][\w-]*/, kind: 'variable' }],
});
