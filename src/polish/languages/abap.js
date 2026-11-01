import { starter, quoted } from './shared/starter.js';
/** ABAP starter; string-template expressions remain string-colored. */
export default starter({
  id: 'abap', insensitive: true,
  comments: [{ id: 'column-comment', pattern: /^\*[^\r\n]*/m, kind: 'comment' }, { id: 'comment', pattern: /"[^\r\n]*/, kind: 'comment' }],
  strings: [quoted('single', "'", { doubled: true, escape: false }), quoted('backtick', '`', { doubled: true, escape: false }), quoted('template', '|', { multiline: true })],
  before: [{ id: 'field-symbol', pattern: /<[A-Za-z_][\w-]*>/, kind: 'variable' }],
  keywords: 'APPEND ASSIGN AT AUTHORITY-CHECK BEGIN CALL CASE CATCH CHECK CLASS CLEAR CLOSE COLLECT COMMIT CONSTANTS CONTINUE CREATE DATA DELETE DESCRIBE DO ELSE ELSEIF END ENDAT ENDCASE ENDCLASS ENDDO ENDFORM ENDFUNCTION ENDIF ENDLOOP ENDMETHOD ENDMODULE ENDSELECT ENDTRY ENDTYPES ENDWHILE EVENTS EXIT EXPORT FIELD-SYMBOLS FORM FREE FROM FUNCTION IF IMPLEMENTATION IMPORT INCLUDE INSERT INTERFACE INTO LEAVE LOOP MESSAGE METHOD METHODS MODIFY MODULE MOVE NEW OBJECTS OPEN PARAMETERS PRIVATE PROTECTED PUBLIC RAISE READ REFRESH REPORT RETURN ROLLBACK SELECT SORT SPLIT START-OF-SELECTION TABLE TABLES THEN TO TRANSLATE TRY TYPES UPDATE VALUE WHEN WHERE WHILE WITH WRITE',
  types: 'abap_bool c d decfloat16 decfloat34 f i int8 n p string t x xstring', constants: 'abap_true abap_false space initial',
});
