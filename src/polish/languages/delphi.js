import pascal from './pascal.js';
import { composeLanguage } from '../compose.js';
import { words } from './shared/c-family.js';
/** Delphi/Object Pascal starter, not complete compiler-directive semantics. */
export default composeLanguage(pascal, {
  id: 'delphi', edits: [{ op: 'insertBefore', target: 'keyword', rules: [
    { id: 'delphi-keyword', pattern: new RegExp(words('abstract automated class dispinterface except exports final finalization finally helper initialization is library on out overload override private property protected public published raise reference resourcestring sealed static strict threadvar try unsafe virtual winapi').source, 'i'), kind: 'keyword' },
    { id: 'delphi-type', pattern: /\b(?:AnsiChar|AnsiString|Cardinal|Currency|Double|Extended|Int64|NativeInt|NativeUInt|UnicodeString|Variant|WideChar|WideString)\b/i, kind: 'type' },
  ] }],
});
