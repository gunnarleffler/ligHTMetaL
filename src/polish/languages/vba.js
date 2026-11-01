import { basicLanguage } from './shared/basic.js';
/** VBA lexical subset, distinct from VB.NET. Host object models are not resolved. */
export default basicLanguage({
  id: 'vba',
  keywords: 'Alias And As Attribute Base Begin Binary ByRef ByVal Call Case Class Close Compare Const Declare DefBool DefByte DefCur DefDate DefDbl DefInt DefLng DefObj DefSng DefStr DefVar Dim Do Each Else ElseIf End Enum Eqv Erase Error Event Exit Explicit For Friend Function Get GoSub GoTo If Imp Implements In Input Is Let Lib Like Line Lock Loop LSet Mod Name New Next Not On Open Option Optional Or Output ParamArray Preserve Print Private Property Public Put RaiseEvent Random Read ReDim Rem Reset Resume Return RSet Seek Select Set Static Step Stop Sub Then To Type TypeOf Unlock Until Wend While With WithEvents Write Xor',
  types: 'Boolean Byte Currency Date Decimal Double Integer Long LongLong LongPtr Object Single String Variant',
});
