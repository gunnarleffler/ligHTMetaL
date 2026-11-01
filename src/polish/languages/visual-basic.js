import { basicLanguage } from './shared/basic.js';
/** Modern VB.NET starter; XML literals/interpolation expressions are not parsed. */
export default basicLanguage({
  id: 'visual-basic', aliases: ['vb', 'vbnet'], interpolated: true,
  keywords: 'AddHandler AddressOf Alias And AndAlso As Async Await ByRef ByVal Call Case Catch Class Const Continue Custom Declare Default Delegate Dim DirectCast Do Each Else ElseIf End Enum Erase Error Event Exit Finally For Friend Function Get GetType GetXmlNamespace Global GoSub GoTo Handles If Implements Imports In Inherits Interface Is IsNot Iterator Let Lib Like Loop Me Mod Module MustInherit MustOverride MyBase MyClass Namespace Narrowing New Next Not NotInheritable NotOverridable Of On Operator Option Optional Or OrElse Out Overloads Overridable Overrides ParamArray Partial Private Property Protected Public RaiseEvent ReadOnly ReDim RemoveHandler Resume Return Select Set Shadows Shared Static Step Stop Structure Sub SyncLock Then Throw To Try TryCast TypeOf Using When While Widening With WithEvents WriteOnly Xor Yield',
  types: 'Boolean Byte Char Date Decimal Double Integer Long Object SByte Short Single String UInteger ULong UShort',
});
